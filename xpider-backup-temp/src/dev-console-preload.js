/**
 * XPIDER DevConsole Preload — 개발자 전용 디버그 콘솔 contextBridge
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('devConsoleAPI', {

    // 초기 스냅샷 및 실시간 레코드 수신
    onSnapshot:  (cb) => ipcRenderer.on('devlog-snapshot', (_, logs) => cb(logs)),
    onRecord:    (cb) => ipcRenderer.on('devlog-record',   (_, rec)  => cb(rec)),

    // 서버에서 로그 전체 조회 (필터 포함)
    getLogs: (filter) => ipcRenderer.invoke('xpider-devlog-get', filter),

    // 로그 초기화
    clearLogs: () => ipcRenderer.invoke('xpider-devlog-clear'),

    // 로그 파일 탐색기로 열기
    openLogFile: () => ipcRenderer.invoke('xpider-devlog-open-file'),

    // 로그 파일 경로 반환
    getLogPath: () => ipcRenderer.invoke('xpider-devlog-get-path'),

    // 창 닫기
    closeConsole: () => ipcRenderer.invoke('xpider-devlog-close-console'),
});
