const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

// 콘솔 색상 설정
const C = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
};

function runCmd(cmd) {
    console.log(`${C.cyan}> 실행: ${cmd}${C.reset}`);
    try {
        execSync(cmd, { stdio: 'inherit' });
        return true;
    } catch (e) {
        console.error(`${C.red}명령어 실행 실패: ${e.message}${C.reset}`);
        return false;
    }
}

async function updateApp() {
    console.log(`\n${C.yellow}=== [ 브라우저 앱 배포 ] ===${C.reset}`);
    const pkgPath = path.join(__dirname, 'package.json');
    if (!fs.existsSync(pkgPath)) return console.log(`${C.red}package.json 파일을 찾을 수 없습니다.${C.reset}`);
    
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    console.log(`현재 앱 버전: ${C.green}v${pkg.version}${C.reset}\n`);
    
    console.log(`1. 버그 수정 (Patch)     : ${pkg.version} -> 끝자리 증가`);
    console.log(`2. 기능 추가 (Minor)     : ${pkg.version} -> 중간자리 증가`);
    console.log(`3. 대규모 변경 (Major)   : ${pkg.version} -> 앞자리 증가`);
    console.log(`4. 직접 버전 입력`);
    
    const sel = await ask(`\n어떤 업데이트입니까? (1/2/3/4, 취소: 엔터): `);
    let type = '';
    if (sel === '1') type = 'patch';
    else if (sel === '2') type = 'minor';
    else if (sel === '3') type = 'major';
    else if (sel === '4') {
        type = await ask('새 버전 입력 (예: 2.3.0): ');
        if (!type) return console.log('취소되었습니다.');
    } else {
        return console.log('취소되었습니다.');
    }

    console.log(`\n⏳ 버전 업데이트 및 태그 생성을 시작합니다...`);
    // npm version 명령어가 package.json 갱신, git commit, git tag를 모두 수행합니다.
    if (!runCmd(`npm version ${type}`)) return;
    
    const pushAns = await ask(`\n${C.yellow}GitHub에 업로드하여 배포(빌드)를 시작할까요? (Y/n): ${C.reset}`);
    if (pushAns.toLowerCase() !== 'n') {
        runCmd('git push origin main');
        runCmd('git push origin --tags');
        console.log(`\n${C.green}✅ 앱 배포 완료! GitHub Actions에서 빌드가 곧 시작됩니다.${C.reset}`);
    }
}

async function updateExtension() {
    console.log(`\n${C.yellow}=== [ 익스텐션 업데이트 ] ===${C.reset}`);
    
    // 원본 작업 폴더 동기화 설정
    const sources = [
        { src: 'e:/vivpr/ai/collect-list_v2/extension', dest: 'collect-list' },
        { src: 'e:/vivpr/ai/send message',               dest: 'send-message' }
    ];
    
    const extDir = path.join(__dirname, 'extensions');
    if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true });
    
    console.log('🔄 원본 소스 폴더에서 최신 코드를 브라우저 저장소로 복사하는 중...');
    sources.forEach(({ src, dest }) => {
        if (fs.existsSync(src)) {
            try { 
                fs.cpSync(src, path.join(extDir, dest), { recursive: true, force: true }); 
            } catch (e) { }
        }
    });

    const exts = fs.readdirSync(extDir).filter(f => fs.statSync(path.join(extDir, f)).isDirectory());
    if (exts.length === 0) return console.log(`${C.red}설치된 익스텐션이 없습니다.${C.reset}`);

    console.log('\n어떤 익스텐션을 배포할까요?');
    exts.forEach((ext, i) => {
        let ver = '알 수 없음';
        const manifestPath = path.join(extDir, ext, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            try { ver = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version || ver; } catch(e){}
        }
        console.log(`${i + 1}. ${ext} (현재 ${C.green}v${ver}${C.reset})`);
    });

    const selStr = await ask(`\n번호 선택 (취소: 엔터): `);
    const sel = parseInt(selStr);
    if (isNaN(sel) || sel < 1 || sel > exts.length) return console.log('취소되었습니다.');

    const extName = exts[sel - 1];
    const sourceMap = sources.find(s => s.dest === extName);
    
    // 타겟 manifest 찾기
    const extManifestPath = path.join(extDir, extName, 'manifest.json');
    const sourceManifestPath = sourceMap ? path.join(sourceMap.src, 'manifest.json') : null;
    
    if (!fs.existsSync(extManifestPath)) return console.log(`${C.red}manifest.json 파일이 없습니다.${C.reset}`);
    const manifest = JSON.parse(fs.readFileSync(extManifestPath, 'utf8'));
    const oldVer = manifest.version || '1.0.0';
    
    console.log(`\n선택된 익스텐션: ${C.cyan}${extName}${C.reset} (현재 v${oldVer})`);
    let newVer = await ask('새 버전 입력 (예: 1.0.1): ');
    newVer = newVer.trim();
    if (!newVer || newVer === oldVer) return console.log('취소되었습니다.');

    // JSON 버전 수정
    const updateManifest = (mPath) => {
        if (fs.existsSync(mPath)) {
            const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
            m.version = newVer;
            fs.writeFileSync(mPath, JSON.stringify(m, null, 2));
        }
    };

    updateManifest(extManifestPath);         // 브라우저 저장소 반영
    if (sourceManifestPath) updateManifest(sourceManifestPath); // 원본 폴더도 동기화 반영

    console.log(`\n${C.green}✅ ${extName} 버전이 v${newVer} 로 변경되었습니다.${C.reset}`);

    const pushAns = await ask(`\n${C.yellow}GitHub에 코드를 업로드하여 사용자 배포를 진행할까요? (Y/n): ${C.reset}`);
    if (pushAns.toLowerCase() !== 'n') {
        runCmd('git add extensions/');
        runCmd(`git commit -m "feat(ext): update ${extName} to v${newVer}"`);
        runCmd('git push origin main');
        console.log(`\n${C.green}✅ 익스텐션 배포 완료! 사용자들이 브라우저를 다시 켤 때 최신 버전이 자동 설치됩니다.${C.reset}`);
    }
}

async function main() {
    console.clear();
    console.log(`${C.cyan}==========================================`);
    console.log(`🚀 XPIDER 배포 & 버전 관리 툴 v1.0`);
    console.log(`==========================================${C.reset}`);
    
    while (true) {
        console.log(`\n무엇을 배포하시겠습니까?`);
        console.log(`1. 🌍 브라우저 앱 업데이트 (전체 프로그램 배포 / 설치 파일 빌드)`);
        console.log(`2. 🧩 개별 익스텐션 업데이트 (기능 수정 배포 / 자동 다운로드 트리거)`);
        console.log(`0. 종료`);
        
        const ans = await ask(`\n선택: `);
        if (ans === '1') {
            await updateApp();
        } else if (ans === '2') {
            await updateExtension();
        } else if (ans === '0') {
            console.log('\n종료합니다.');
            rl.close();
            break;
        } else {
            console.log(`${C.red}잘못된 입력입니다.${C.reset}`);
        }
    }
}

main().catch(e => console.error(`${C.red}오류 발생: ${e.message}${C.reset}`));
