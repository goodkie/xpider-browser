module.exports = {
  packagerConfig: {
    asar: true,
    name: 'XPIDER Browser',
    executableName: 'XPIDERBrowser',
    extraResource: ['./extensions'],
    icon: './assets/icons/win/icon',  // .ico (Win) / .icns (Mac) 자동 선택
    appBundleId: 'com.xpider.browser',
    appVersion: require('./package.json').version,
    // 다중 인스턴스 지원: ZIP 압축만 풀면 여러 폴더에 설치 가능
    osxSign: process.env.CSC_LINK ? {} : undefined,
  },
  rebuildConfig: {},

  makers: [
    // ──────────────────────────────────────────
    // 포터블 ZIP — Windows + macOS 통합 (다중 설치용)
    // ──────────────────────────────────────────
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32', 'darwin'],
      config: {},
    },
  ],

  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
