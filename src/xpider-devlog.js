/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  XPIDER DEV LOG — 개발자 전용 스텔스 디버깅 로그 허브 v4.17.0   ║
 * ║  작성자: 개발자 전용 (외부 노출 금지)                            ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 *
 * 이 모듈은 XPIDER 브라우저의 모든 동작을 실시간으로 수집합니다:
 *  - Main Process IPC 호출
 *  - 모든 탭(WebContents) console.log / 네트워크 요청 / 이벤트
 *  - 모든 익스텐션 background / content / popup
 *  - Campaign Engine 전체 작동
 *
 * 저장 위치: AppData/XPIDER-Browser-Common-Data/devlogs/xpider_debug.log
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── 상수 ──────────────────────────────────────────────────────────────────
const MAX_MEMORY_LOGS = 10000;    // 인메모리 링버퍼 최대 건수
const MAX_FILE_BYTES  = 5 * 1024 * 1024; // 5 MB 초과 시 로테이션
const LOG_LEVELS = ['INFO', 'WARN', 'ERROR', 'DEBUG', 'ENGINE', 'TAB', 'NET', 'EXT', 'IPC'];

// ─── 내부 상태 ─────────────────────────────────────────────────────────────
let _logDir       = null;
let _logFilePath  = null;
let _writeStream  = null;
let _seqCounter   = 0;
let _ringBuffer   = [];          // 최근 MAX_MEMORY_LOGS 건
let _devConsoleWin = null;       // DevConsole BrowserWindow 참조
let _initialized  = false;

// ─── 초기화 ────────────────────────────────────────────────────────────────
/**
 * @param {string} appDataPath  app.getPath('appData') 결과
 */
function init(appDataPath) {
    if (_initialized) return;
    _initialized = true;

    _logDir = path.join(appDataPath, 'XPIDER-Browser-Common-Data', 'devlogs');
    if (!fs.existsSync(_logDir)) {
        fs.mkdirSync(_logDir, { recursive: true });
    }

    _logFilePath = path.join(_logDir, 'xpider_debug.log');
    _openStream();

    addLog('INFO', 'DevLog', `=== XPIDER DevLog 초기화 완료 | 로그 경로: ${_logFilePath} ===`);
}

// ─── 파일 스트림 열기 ──────────────────────────────────────────────────────
function _openStream() {
    try {
        if (_writeStream) {
            try { _writeStream.end(); } catch (_) {}
        }
        _writeStream = fs.createWriteStream(_logFilePath, { flags: 'a', encoding: 'utf8' });
        _writeStream.on('error', (err) => {
            console.error('[DevLog] WriteStream 오류:', err.message);
        });
    } catch (e) {
        console.error('[DevLog] 스트림 오픈 실패:', e.message);
    }
}

// ─── 파일 로테이션 ─────────────────────────────────────────────────────────
function _rotateIfNeeded() {
    try {
        if (!fs.existsSync(_logFilePath)) return;
        const stat = fs.statSync(_logFilePath);
        if (stat.size < MAX_FILE_BYTES) return;

        // 현재 스트림 닫기
        if (_writeStream) { try { _writeStream.end(); } catch (_) {} }

        // 타임스탬프로 백업
        const now = new Date();
        const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
        const bakPath = path.join(_logDir, `xpider_debug_${ts}.bak.log`);
        fs.renameSync(_logFilePath, bakPath);

        // 새 스트림 오픈
        _openStream();
        addLog('INFO', 'DevLog', `로그 로테이션 완료 → 백업: ${bakPath}`);
    } catch (e) {
        console.error('[DevLog] 로테이션 오류:', e.message);
    }
}

// ─── 로그 추가 (핵심 함수) ─────────────────────────────────────────────────
/**
 * @param {string} level   LOG_LEVELS 중 하나
 * @param {string} source  로그 출처 식별자
 * @param {string} message 로그 메시지
 * @param {object} [extra] 추가 구조화 데이터
 */
function addLog(level, source, message, extra) {
    if (!_initialized && level !== 'INFO') return; // 초기화 전 DROP (초기화 자체 로그만 허용)

    const record = {
        ts:     new Date().toISOString(),
        seq:    ++_seqCounter,
        level:  (level || 'INFO').toUpperCase(),
        source: source || 'Unknown',
        msg:    String(message || '').substring(0, 4096), // 4KB 상한
        extra:  extra || undefined
    };

    // 1. 인메모리 링버퍼
    _ringBuffer.push(record);
    if (_ringBuffer.length > MAX_MEMORY_LOGS) {
        _ringBuffer.shift(); // 오래된 것 제거
    }

    // 2. 파일 기록
    if (_writeStream && _writeStream.writable) {
        try {
            _writeStream.write(JSON.stringify(record) + '\n');
        } catch (e) {
            // 파일 기록 실패는 무시 (동작 방해 금지)
        }
    }

    // 3. DevConsole 실시간 push
    if (_devConsoleWin && !_devConsoleWin.isDestroyed()) {
        try {
            _devConsoleWin.webContents.send('devlog-record', record);
        } catch (_) {}
    }

    // 4. 파일 로테이션 주기 체크 (100건마다)
    if (_seqCounter % 100 === 0) {
        setImmediate(_rotateIfNeeded);
    }
}

// ─── 로그 조회 ─────────────────────────────────────────────────────────────
/**
 * @param {object} [filter]
 * @param {string} [filter.level]   특정 레벨만
 * @param {string} [filter.source]  특정 소스만 (부분 일치)
 * @param {string} [filter.keyword] 메시지 키워드 (부분 일치)
 * @param {number} [filter.last]    최근 N건
 * @returns {Array}
 */
function getLogs(filter = {}) {
    let result = [..._ringBuffer];

    if (filter.level && filter.level !== 'ALL') {
        result = result.filter(r => r.level === filter.level.toUpperCase());
    }
    if (filter.source) {
        const src = filter.source.toLowerCase();
        result = result.filter(r => r.source.toLowerCase().includes(src));
    }
    if (filter.keyword) {
        const kw = filter.keyword.toLowerCase();
        result = result.filter(r => r.msg.toLowerCase().includes(kw));
    }
    if (filter.last && filter.last > 0) {
        result = result.slice(-filter.last);
    }

    return result;
}

// ─── 로그 초기화 ───────────────────────────────────────────────────────────
function clearLogs() {
    _ringBuffer = [];
    _seqCounter = 0;
    addLog('INFO', 'DevLog', '=== 로그 버퍼 초기화됨 ===');
}

// ─── 로그 파일 경로 반환 ───────────────────────────────────────────────────
function getLogFilePath() {
    return _logFilePath;
}

function getLogDir() {
    return _logDir;
}

// ─── DevConsole 창 참조 설정 ───────────────────────────────────────────────
function setDevConsoleWindow(win) {
    _devConsoleWin = win;
    if (win && !win.isDestroyed()) {
        // 연결 직후 기존 버퍼 전송 (최근 500건)
        const snapshot = _ringBuffer.slice(-500);
        try {
            win.webContents.send('devlog-snapshot', snapshot);
        } catch (_) {}
        addLog('INFO', 'DevLog', `DevConsole 연결됨 — ${snapshot.length}건 스냅샷 전송`);
    }
}

function getDevConsoleWindow() {
    return _devConsoleWin;
}

// ─── 스트림 종료 (앱 종료 시 호출) ────────────────────────────────────────
function close() {
    if (_writeStream) {
        try {
            _writeStream.end();
            _writeStream = null;
        } catch (_) {}
    }
}

// ─── 인메모리 건수 반환 ────────────────────────────────────────────────────
function getBufferSize() {
    return _ringBuffer.length;
}

module.exports = {
    init,
    addLog,
    getLogs,
    clearLogs,
    close,
    getLogFilePath,
    getLogDir,
    getBufferSize,
    setDevConsoleWindow,
    getDevConsoleWindow,
};
