const fs = require('fs');
const path = require('path');

function bumpPatchVersion(versionStr) {
  if (!versionStr) return '1.0.1';
  const parts = versionStr.split('.').map(Number);
  if (parts.length < 3) {
    while (parts.length < 3) parts.push(0);
  }
  parts[2] = parts[2] + 1;
  return parts.join('.');
}

// 1. package.json 업데이트
const pkgPath = 'e:/vivpr/ai/xpider-trial/package.json';
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const oldVer = pkg.version;
  pkg.version = '4.10.35'; // 신규 브라우저 버전 지정
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
  console.log(`[App] package.json version bumped: ${oldVer} -> ${pkg.version}`);
} else {
  console.error('[Error] package.json not found!');
}

// 2. 익스텐션 업데이트
const extDir = 'e:/vivpr/ai/xpider-trial/extensions';
const folders = [
  '_old_collect-list_v2',
  'bing_map_source',
  'Email_Extractor_Source',
  'google_maps_extension_source',
  'LocalBusinessDataCrawlerPro',
  'proxy',
  'send_email_backup',
  'send_message_backup'
];

folders.forEach(folder => {
  const mPath = path.join(extDir, folder, 'manifest.json');
  if (fs.existsSync(mPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'));
      const oldVer = manifest.version || '1.0.0';
      const newVer = bumpPatchVersion(oldVer);
      manifest.version = newVer;
      fs.writeFileSync(mPath, JSON.stringify(manifest, null, 2), 'utf8');
      console.log(`[Ext] ${folder} version bumped: ${oldVer} -> ${newVer}`);
    } catch (e) {
      console.error(`[Error] Failed to process ${folder}:`, e.message);
    }
  } else {
    console.warn(`[Warning] manifest.json not found in ${folder}`);
  }
});

console.log('\nAll version bump operations completed!');
