/**
 * XPIDER Deploy Center — 로컬 서버
 * node src/deploy/server.js 로 실행
 */
const http    = require('http');
const { spawn } = require('child_process');
const fs      = require('fs');
const path    = require('path');

const ROOT = path.join(__dirname, '../..');
const PORT = 9987;
const CONFIG_FILE = path.join(__dirname, 'deploy-config.json');
const https = require('https');
const GITHUB_TOKEN = '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';

function githubGet(apiPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: apiPath,
      method: 'GET',
      headers: {
        'User-Agent': 'XPIDER-Deploy-Center',
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: null }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}


function getSources() {
  if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')).sources || {};
  const def = {}; // 디폴트 예시 제거
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ sources: def }, null, 2));
  return def;
}

function saveSource(name, srcPath) {
  const cfg = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : { sources: {} };
  cfg.sources = cfg.sources || {};
  cfg.sources[name] = srcPath;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// ── SSE 클라이언트 ──────────────────────────────────────────
const clients = new Set();

function broadcast(type, payload) {
  const msg = `data: ${JSON.stringify({ type, payload })}\n\n`;
  clients.forEach(r => { try { r.write(msg); } catch(e) { clients.delete(r); } });
}

// ── 명령어 실행 ──────────────────────────────────────────────
function runCmd(cmd, args, cwd = ROOT) {
  return new Promise(resolve => {
    broadcast('log', { text: `> ${cmd} ${args.join(' ')}`, err: false });
    const p = spawn(cmd, args, { cwd, shell: true });
    p.stdout.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => broadcast('log', { text: l, err: false })));
    p.stderr.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => broadcast('log', { text: l, err: true  })));
    p.on('close', code => { broadcast('log', { text: `Exit: ${code}`, err: code !== 0 }); resolve(code === 0); });
  });
}

// ── 정보 읽기 ────────────────────────────────────────────────
async function getInfo() {
  const pkg  = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const extensions = [];
  const sources = getSources();
  
  // GitHub 원격 저장소에서 직접 가져오기
  const res = await githubGet('/repos/goodkie/xpider-browser/contents/extensions');
  if (res.status === 200 && Array.isArray(res.body)) {
    const extFolders = res.body.filter(item => item.type === 'dir');
    for (const folder of extFolders) {
      const extName = folder.name;
      const mRes = await githubGet(`/repos/goodkie/xpider-browser/contents/extensions/${extName}/manifest.json`);
      let version = '0.0.0';
      let description = '';
      if (mRes.status === 200 && mRes.body && mRes.body.content) {
        try {
          const mText = Buffer.from(mRes.body.content, 'base64').toString('utf8');
          const mData = JSON.parse(mText);
          version = mData.version || '0.0.0';
          description = mData.description || '';
        } catch (e) { console.error('Failed to parse manifest for', extName); }
      }
      let extStatus = 'Clean';
      try {
        const out = require('child_process').execSync(`git status --porcelain extensions/${extName}`, { cwd: ROOT }).toString().trim();
        if (out.length > 0) extStatus = 'Modified';
      } catch(e) {}
      extensions.push({ name: extName, version, description, sourcePath: sources[extName] || '', status: extStatus });
    }
  } else {
    // GitHub API 실패 시 로컬 폴더 폴백
    const extDir = path.join(ROOT, 'extensions');
    if (fs.existsSync(extDir)) {
      fs.readdirSync(extDir).forEach(name => {
        const mPath = path.join(extDir, name, 'manifest.json');
        if (fs.existsSync(mPath) && fs.statSync(path.join(extDir, name)).isDirectory()) {
          const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
          let extStatus = 'Clean';
          try {
            const out = require('child_process').execSync(`git status --porcelain extensions/${name}`, { cwd: ROOT }).toString().trim();
            if (out.length > 0) extStatus = 'Modified';
          } catch(e) {}
          extensions.push({ name, version: m.version || '0.0.0', description: m.description || '', sourcePath: sources[name] || '', status: extStatus });
        }
      });
    }
  }

  // 현재 브랜치
  let branch = 'main';
  try { branch = require('child_process').execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim(); } catch(e){}
  // Git 상태
  let dirty = 0;
  try { dirty = require('child_process').execSync('git status --porcelain', { cwd: ROOT }).toString().split('\n').filter(Boolean).length; } catch(e){}
  return { appVersion: pkg.version, appName: pkg.name, extensions, branch, dirty };
}

// ── 버전 계산 ────────────────────────────────────────────────
function bumpVersion(ver, type) {
  let [M, m, p] = ver.split('.').map(Number);
  if (type === 'patch') p++;
  else if (type === 'minor') { m++; p = 0; }
  else if (type === 'major') { M++; m = 0; p = 0; }
  return `${M}.${m}.${p}`;
}

// ── 앱 배포 ──────────────────────────────────────────────────
async function deployApp(type) {
  broadcast('status', 'deploying');

  // 특수 명령
  if (type === '__pull__') {
    await runCmd('git', ['pull', 'origin', 'main']);
    broadcast('status', 'idle');
    broadcast('refresh', await getInfo());
    return;
  }
  if (type === '__rollback__') {
    await runCmd('git', ['revert', 'HEAD', '--no-edit']);
    await runCmd('git', ['push', 'origin', 'main']);
    broadcast('status', 'idle');
    broadcast('refresh', await getInfo());
    return;
  }

  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const newVer = type.match(/^\d+\.\d+\.\d+$/) ? type : bumpVersion(pkg.version, type);
  pkg.version = newVer;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  broadcast('log', { text: `📦 Version: ${pkg.version} → ${newVer}`, err: false });
  await runCmd('git', ['add', 'package.json']);
  await runCmd('git', ['commit', '-m', `"release: v${newVer}"`]);
  await runCmd('git', ['tag', `v${newVer}`]);
  await runCmd('git', ['push', 'origin', 'main']);
  await runCmd('git', ['push', 'origin', '--tags']);
  broadcast('status', 'idle');
  broadcast('refresh', await getInfo());
}


// ── 익스텐션 배포 ────────────────────────────────────────────
async function deployExt(name, newVersion) {
  broadcast('status', 'deploying');
  const sources = getSources();
  const srcDir = sources[name];
  const destDir = path.join(ROOT, 'extensions', name);

  if (srcDir && fs.existsSync(srcDir)) {
    broadcast('log', { text: `📋 Sync from: ${srcDir}`, err: false });
    fs.cpSync(srcDir, destDir, { recursive: true, force: true });
    const sm = path.join(srcDir, 'manifest.json');
    if (fs.existsSync(sm)) { const m = JSON.parse(fs.readFileSync(sm,'utf8')); m.version = newVersion; fs.writeFileSync(sm, JSON.stringify(m,null,2)); }
  }
  const dm = path.join(destDir, 'manifest.json');
  if (fs.existsSync(dm)) { const m = JSON.parse(fs.readFileSync(dm,'utf8')); m.version = newVersion; fs.writeFileSync(dm, JSON.stringify(m,null,2)); }

  await runCmd('git', ['add', `extensions/${name}`]);
  await runCmd('git', ['commit', '-m', `"feat(ext): ${name} v${newVersion}"`]);
  await runCmd('git', ['push', 'origin', 'main']);
  broadcast('status', 'idle');
  broadcast('refresh', await getInfo());
}

// ── 익스텐션 소스만 동기화 ───────────────────────────────────
async function syncExt(name) {
  broadcast('status', 'deploying');
  const sources = getSources();
  const srcDir = sources[name];
  const destDir = path.join(ROOT, 'extensions', name);
  if (srcDir && fs.existsSync(srcDir)) {
    fs.cpSync(srcDir, destDir, { recursive: true, force: true });
    broadcast('log', { text: `✅ Synced: ${name}`, err: false });
    await runCmd('git', ['add', `extensions/${name}`]);
    await runCmd('git', ['commit', '-m', `"chore(ext): sync extension ${name} from local source"`]);
    await runCmd('git', ['push', 'origin', 'main']);
  } else {
    broadcast('log', { text: `⚠ Source not found: ${srcDir}`, err: true });
  }
  broadcast('status', 'idle');
  broadcast('refresh', await getInfo());
}

// ── HTML ─────────────────────────────────────────────────────
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// ── JSON 바디 읽기 헬퍼 ──────────────────────────────────────
function readBody(req) {
  return new Promise(res => { let b=''; req.on('data',c=>b+=c); req.on('end',()=>res(JSON.parse(b||'{}')));});
}

// ── HTTP 서버 ────────────────────────────────────────────────
http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    res.setHeader('Access-Control-Allow-Origin','*');

    if (u.pathname === '/') {
      res.writeHead(200, {'Content-Type':'text/html;charset=utf-8'}); res.end(HTML); return;
    }
    if (u.pathname === '/events') {
      res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
      res.write(`data: ${JSON.stringify({type:'connected'})}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (u.pathname === '/api/info') {
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(await getInfo())); return;
    }
    if (u.pathname === '/api/releases' && req.method==='GET') {
      const releases = [];
      try {
        if (fs.existsSync(ROOT)) {
          fs.readdirSync(ROOT).forEach(file => {
            if ((file.startsWith('XPIDER-Browser-Windows-') && file.endsWith('.exe')) ||
                (file.startsWith('XPIDER-Browser-Windows-') && file.endsWith('.zip'))) {
              const stat = fs.statSync(path.join(ROOT, file));
              releases.push({
                name: file,
                size: stat.size,
                mtime: stat.mtime.getTime(),
                location: 'root'
              });
            }
          });
        }
        
        const squirrelDir = path.join(ROOT, 'out', 'make', 'squirrel', 'win32', 'x64');
        if (fs.existsSync(squirrelDir)) {
          fs.readdirSync(squirrelDir).forEach(file => {
            if (file.endsWith('.exe')) {
              const stat = fs.statSync(path.join(squirrelDir, file));
              if (!releases.some(r => r.name === file)) {
                releases.push({
                  name: file,
                  size: stat.size,
                  mtime: stat.mtime.getTime(),
                  location: 'make-squirrel'
                });
              }
            }
          });
        }

        const zipDir = path.join(ROOT, 'out', 'make', 'zip', 'win32', 'x64');
        if (fs.existsSync(zipDir)) {
          fs.readdirSync(zipDir).forEach(file => {
            if (file.endsWith('.zip')) {
              const stat = fs.statSync(path.join(zipDir, file));
              if (!releases.some(r => r.name === file)) {
                releases.push({
                  name: file,
                  size: stat.size,
                  mtime: stat.mtime.getTime(),
                  location: 'make-zip'
                });
              }
            }
          });
        }
      } catch (err) {
        console.error('Error listing releases:', err);
      }
      
      releases.sort((a, b) => b.mtime - a.mtime);
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify(releases));
      return;
    }
    if (u.pathname.startsWith('/releases/')) {
      const fileName = decodeURIComponent(u.pathname.substring(10));
      if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
        res.writeHead(403); res.end('Access Denied'); return;
      }
      
      let filePath = path.join(ROOT, fileName);
      if (!fs.existsSync(filePath)) {
        if (fileName.endsWith('.exe')) {
          filePath = path.join(ROOT, 'out', 'make', 'squirrel', 'win32', 'x64', fileName);
        } else if (fileName.endsWith('.zip')) {
          filePath = path.join(ROOT, 'out', 'make', 'zip', 'win32', 'x64', fileName);
        }
      }
      
      if (fs.existsSync(filePath)) {
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      } else {
        res.writeHead(404); res.end('File Not Found'); return;
      }
    }
    if (u.pathname === '/api/get-tos' && req.method==='GET') {
      const lang = u.searchParams.get('lang') || 'en';
      const tosPath = path.join(ROOT, `TOS_${lang}.md`);
      const content = fs.existsSync(tosPath) ? fs.readFileSync(tosPath, 'utf8') : '';
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ content })); return;
    }
    if (u.pathname === '/api/edit-tos' && req.method==='POST') {
      const { content, lang } = await readBody(req);
      const l = lang || 'en';
      broadcast('status', 'deploying');
      fs.writeFileSync(path.join(ROOT, `TOS_${l}.md`), content, 'utf8');
      await runCmd('git', ['add', `TOS_${l}.md`]);
      await runCmd('git', ['commit', '-m', `"docs: update Terms of Service (${l})"`]);
      await runCmd('git', ['push', 'origin', 'main']);
      broadcast('status', 'idle');
      res.writeHead(200,{'Content-Type':'application/json'}); res.end('{"ok":true}'); return;
    }
    if (u.pathname === '/api/deploy-app' && req.method==='POST') {
      const { type } = await readBody(req);
      deployApp(type);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end('{"ok":true}'); return;
    }
    if (u.pathname === '/api/deploy-ext' && req.method==='POST') {
      const { name, version } = await readBody(req);
      deployExt(name, version);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end('{"ok":true}'); return;
    }
    if (u.pathname === '/api/sync-ext' && req.method==='POST') {
      const { name } = await readBody(req);
      const sources = getSources();
      const srcDir = sources[name];
      if (srcDir && fs.existsSync(srcDir)) {
        if (!fs.existsSync(path.join(srcDir, 'manifest.json'))) {
          res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error: "업로드 실패: 지정된 폴더의 최상위에 manifest.json 파일이 존재하지 않습니다. 폴더 경로를 다시 확인해 주세요."})); return;
        }
      }
      await syncExt(name);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end('{"ok":true}'); return;
    }
    if (u.pathname === '/api/add-ext' && req.method==='POST') {
      const { name, sourcePath } = await readBody(req);
      if (sourcePath && fs.existsSync(sourcePath)) {
        if (!fs.existsSync(path.join(sourcePath, 'manifest.json'))) {
          res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error: "업로드 실패: 소스 폴더의 최상위에 manifest.json 파일이 존재하지 않습니다. 브라우저가 인식할 수 없으므로 업로드가 차단되었습니다."})); return;
        }
      }
      broadcast('status', 'deploying');
      
      saveSource(name, sourcePath);
      const destDir = path.join(ROOT, 'extensions', name);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      
      if (fs.existsSync(sourcePath)) {
        broadcast('log', { text: `📋 Copying from: ${sourcePath}`, err: false });
        fs.cpSync(sourcePath, destDir, { recursive: true, force: true });
      }
      
      const dm = path.join(destDir, 'manifest.json');
      if (!fs.existsSync(dm)) {
        const defM = { name, version: "1.0.0", description: "New Extension", icons: { "48": "icon.png" } };
        fs.writeFileSync(dm, JSON.stringify(defM, null, 2));
        if (fs.existsSync(sourcePath)) {
          fs.writeFileSync(path.join(sourcePath, 'manifest.json'), JSON.stringify(defM, null, 2));
        }
      }
      
      await runCmd('git', ['add', 'src/deploy/deploy-config.json']);
      await runCmd('git', ['add', `extensions/${name}`]);
      await runCmd('git', ['commit', '-m', `"feat(ext): add new extension ${name}"`]);
      await runCmd('git', ['push', 'origin', 'main']);
      
      broadcast('status', 'idle');
      broadcast('refresh', await getInfo());
      res.writeHead(200,{'Content-Type':'application/json'}); res.end('{"ok":true}'); return;
    }
    if (u.pathname === '/api/edit-ext' && req.method==='POST') {
      const { oldName, newName, sourcePath } = await readBody(req);
      broadcast('status', 'deploying');
      
      const cfg = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : { sources: {} };
      cfg.sources = cfg.sources || {};
      delete cfg.sources[oldName];
      if (sourcePath) cfg.sources[newName] = sourcePath;
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));

      const oldDir = path.join(ROOT, 'extensions', oldName);
      const newDir = path.join(ROOT, 'extensions', newName);
      
      if (oldName !== newName && fs.existsSync(oldDir)) {
        fs.renameSync(oldDir, newDir);
      }
      
      const mPath = path.join(newDir, 'manifest.json');
      if (fs.existsSync(mPath)) {
        const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
        m.name = newName;
        fs.writeFileSync(mPath, JSON.stringify(m, null, 2));
      }
      
      await runCmd('git', ['add', 'src/deploy/deploy-config.json']);
      await runCmd('git', ['add', '-A', 'extensions']);
      await runCmd('git', ['commit', '-m', `"feat(ext): rename extension ${oldName} -> ${newName}"`]);
      await runCmd('git', ['push', 'origin', 'main']);
      
      broadcast('status', 'idle');
      broadcast('refresh', await getInfo());
      res.writeHead(200,{'Content-Type':'application/json'}); res.end('{"ok":true}'); return;
    }
    if (u.pathname === '/api/delete-ext' && req.method==='POST') {
      const { name } = await readBody(req);
      broadcast('status', 'deploying');
      
      const cfg = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : { sources: {} };
      if (cfg.sources && cfg.sources[name]) {
        delete cfg.sources[name];
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
      }
      
      const destDir = path.join(ROOT, 'extensions', name);
      if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
      }
      
      // extensions 폴더 자체가 삭제되지 않도록 .gitkeep 생성 유지
      const extBase = path.join(ROOT, 'extensions');
      if (!fs.existsSync(extBase)) fs.mkdirSync(extBase, { recursive: true });
      fs.writeFileSync(path.join(extBase, '.gitkeep'), 'keep');
      
      await runCmd('git', ['add', 'src/deploy/deploy-config.json']);
      await runCmd('git', ['add', '-A', 'extensions']);
      await runCmd('git', ['commit', '-m', `"feat(ext): remove extension ${name}"`]);
      await runCmd('git', ['push', 'origin', 'main']);
      
      broadcast('status', 'idle');
      broadcast('refresh', await getInfo());
      res.writeHead(200,{'Content-Type':'application/json'}); res.end('{"ok":true}'); return;
    }
    if (u.pathname === '/api/select-folder' && req.method==='GET') {
      const psCmd = `
        Add-Type -AssemblyName System.Windows.Forms;
        $f = New-Object System.Windows.Forms.FolderBrowserDialog;
        $f.Description = "익스텐션 소스 폴더를 선택하세요";
        if($f.ShowDialog() -eq "OK") { Write-Output $f.SelectedPath }
      `;
      const child = spawn('powershell', ['-Command', psCmd]);
      let out = '';
      child.stdout.on('data', d => out += d.toString());
      child.on('close', () => {
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ path: out.trim() }));
      });
      return;
    }
    res.writeHead(404); res.end();
  } catch (error) {
    console.error('Server error:', error);
    try { broadcast('log', { text: `서버 오류 발생: ${error.message}`, err: true }); } catch(e){}
    try { broadcast('status', 'idle'); } catch(e){}
    if (!res.headersSent) {
      res.writeHead(500, {'Content-Type':'application/json'});
      res.end(JSON.stringify({error: "서버 처리 중 오류가 발생했습니다: " + error.message}));
    }
  }

}).listen(PORT, () => {
  console.log(`\n🚀 XPIDER Deploy Center → http://localhost:${PORT}\n`);
  require('child_process').exec(`start msedge --app="http://localhost:${PORT}" --window-size=960,720 2>nul || start chrome --app="http://localhost:${PORT}" 2>nul || start http://localhost:${PORT}`);
});
