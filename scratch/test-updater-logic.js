const assert = require('assert');

// 1. 가상 에셋 리스트 정의 (실제 릴리스와 유사)
const assets = [
  { name: 'XPIDER-Browser-Mac-Arm-v4.10.33.dmg', browser_download_url: 'url-arm-dmg' },
  { name: 'XPIDER-Browser-Mac-Intel-v4.10.33.dmg', browser_download_url: 'url-intel-dmg' },
  { name: 'XPIDER-Browser-Windows-v4.10.33-Setup.exe', browser_download_url: 'url-win-exe' },
  { name: 'XPIDER-Browser-Windows-v4.10.33.zip', browser_download_url: 'url-win-zip' }
];

// 2. 에셋 선택 함수 시뮬레이션 (우리가 수정한 로직과 동일)
function selectAsset(assets, platform, arch) {
  let asset;
  if (platform === 'win32') {
    asset = assets.find(a => /setup|sfx/i.test(a.name) && a.name.endsWith('.exe'))
         || assets.find(a => a.name.endsWith('.exe'))
         || assets.find(a => /windows/i.test(a.name) && a.name.endsWith('.zip'))
         || assets.find(a => a.name.endsWith('.zip'));
  } else if (platform === 'darwin') {
    const isArm = arch === 'arm64';
    asset = assets.find(a => {
      const name = a.name.toLowerCase();
      if (!name.endsWith('.dmg') && !name.endsWith('.zip')) return false;
      if (name.includes('universal')) return true;
      if (isArm) {
        return name.includes('arm') || name.includes('silicon');
      } else {
        return name.includes('intel') || name.includes('x64') || name.includes('x86_64');
      }
    }) || assets.find(a => a.name.endsWith('.dmg'))
       || assets.find(a => a.name.endsWith('.zip'));
  } else {
    asset = assets.find(a => a.name.endsWith('.zip'));
  }
  return asset;
}

// 3. 테스트 케이스 수행
function test() {
  console.log("=== macOS ARM64 Test ===");
  const armAsset = selectAsset(assets, 'darwin', 'arm64');
  console.log("Selected ARM Asset:", armAsset.name);
  assert.strictEqual(armAsset.name, 'XPIDER-Browser-Mac-Arm-v4.10.33.dmg');

  console.log("\n=== macOS x64 (Intel) Test ===");
  const intelAsset = selectAsset(assets, 'darwin', 'x64');
  console.log("Selected Intel Asset:", intelAsset.name);
  assert.strictEqual(intelAsset.name, 'XPIDER-Browser-Mac-Intel-v4.10.33.dmg');

  console.log("\n=== macOS Universal Fallback Test ===");
  const universalAssets = [
    { name: 'XPIDER-Browser-Mac-Universal-v4.10.33.dmg', browser_download_url: 'url-univ-dmg' }
  ];
  const univAsset = selectAsset(universalAssets, 'darwin', 'x64');
  console.log("Selected Universal Asset (Intel):", univAsset.name);
  assert.strictEqual(univAsset.name, 'XPIDER-Browser-Mac-Universal-v4.10.33.dmg');

  console.log("\n=== macOS Fallback to first DMG Test ===");
  const rawAssets = [
    { name: 'XPIDER-Browser-v4.10.33.dmg', browser_download_url: 'url-raw-dmg' }
  ];
  const rawAsset = selectAsset(rawAssets, 'darwin', 'x64');
  console.log("Selected Raw Asset (Intel):", rawAsset.name);
  assert.strictEqual(rawAsset.name, 'XPIDER-Browser-v4.10.33.dmg');

  console.log("\n✅ All logic tests passed successfully!");
}

test();
