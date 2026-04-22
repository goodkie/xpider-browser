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

function getSources() {
  if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')).sources || {};
  const def = {
    'collect-list': 'e:/vivpr/ai/collect-list_v2/extension',
    'send-message': 'e:/vivpr/ai/send message'
  };
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
function getInfo() {
  const pkg  = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const extDir = path.join(ROOT, 'extensions');
  const extensions = [];
  const sources = getSources();
  if (fs.existsSync(extDir)) {
    fs.readdirSync(extDir).forEach(name => {
      const mPath = path.join(extDir, name, 'manifest.json');
      if (fs.existsSync(mPath) && fs.statSync(path.join(extDir, name)).isDirectory()) {
        const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
        extensions.push({ name, version: m.version || '0.0.0', description: m.description || '', sourcePath: sources[name] || '' });
      }
    });
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
    broadcast('refresh', getInfo());
    return;
  }
  if (type === '__rollback__') {
    await runCmd('git', ['revert', 'HEAD', '--no-edit']);
    await runCmd('git', ['push', 'origin', 'main']);
    broadcast('status', 'idle');
    broadcast('refresh', getInfo());
    return;
  }

  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const newVer = type.match(/^\d+\.\d+\.\d+$/) ? type : bumpVersion(pkg.version, type);
  pkg.version = newVer;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  broadcast('log', { text: `📦 Version: ${pkg.version} → ${newVer}`, err: false });
  await runCmd('git', ['add', 'package.json']);
  await runCmd('git', ['commit', '-m', `release: v${newVer}`]);
  await runCmd('git', ['tag', `v${newVer}`]);
  await runCmd('git', ['push', 'origin', 'main']);
  await runCmd('git', ['push', 'origin', '--tags']);
  broadcast('status', 'idle');
  broadcast('refresh', getInfo());
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
  await runCmd('git', ['commit', '-m', `feat(ext): ${name} v${newVersion}`]);
  await runCmd('git', ['push', 'origin', 'main']);
  broadcast('status', 'idle');
  broadcast('refresh', getInfo());
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
  } else {
    broadcast('log', { text: `⚠ Source not found: ${srcDir}`, err: true });
  }
  broadcast('status', 'idle');
}

// ── HTML ─────────────────────────────────────────────────────
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// ── JSON 바디 읽기 헬퍼 ──────────────────────────────────────
function readBody(req) {
  return new Promise(res => { let b=''; req.on('data',c=>b+=c); req.on('end',()=>res(JSON.parse(b||'{}')));});
}

// ── HTTP 서버 ────────────────────────────────────────────────
http.createServer(async (req, res) => {
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
    res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(getInfo())); return;
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
    syncExt(name);
    res.writeHead(200,{'Content-Type':'application/json'}); res.end('{"ok":true}'); return;
  }
  if (u.pathname === '/api/add-ext' && req.method==='POST') {
    const { name, sourcePath } = await readBody(req);
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
    
    await runCmd('git', ['add', `extensions/${name}`]);
    await runCmd('git', ['commit', '-m', `feat(ext): add new extension ${name}`]);
    await runCmd('git', ['push', 'origin', 'main']);
    
    broadcast('status', 'idle');
    broadcast('refresh', getInfo());
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
    
    await runCmd('git', ['add', '-A', 'extensions/']);
    await runCmd('git', ['commit', '-m', `feat(ext): rename extension ${oldName} -> ${newName}`]);
    await runCmd('git', ['push', 'origin', 'main']);
    
    broadcast('status', 'idle');
    broadcast('refresh', getInfo());
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
    
    await runCmd('git', ['add', '-A', 'extensions/']);
    await runCmd('git', ['commit', '-m', `feat(ext): remove extension ${name}`]);
    await runCmd('git', ['push', 'origin', 'main']);
    
    broadcast('status', 'idle');
    broadcast('refresh', getInfo());
    res.writeHead(200,{'Content-Type':'application/json'}); res.end('{"ok":true}'); return;
  }
  res.writeHead(404); res.end();

}).listen(PORT, () => {
  console.log(`\n🚀 XPIDER Deploy Center → http://localhost:${PORT}\n`);
  require('child_process').exec(`start msedge --app="http://localhost:${PORT}" --window-size=960,720 2>nul || start chrome --app="http://localhost:${PORT}" 2>nul || start http://localhost:${PORT}`);
});
