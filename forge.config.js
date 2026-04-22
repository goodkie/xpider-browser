module.exports = {
  packagerConfig: {
    asar: true,
    name: 'XPIDER Browser',
    executableName: 'XPIDERBrowser',
    extraResource: ['./extensions'],
    icon: './assets/icons/win/icon',  // .ico (Win) / .icns (Mac) 자동 선택
    appBundleId: 'com.xpider.browser',
    appVersion: require('./package.json').version,
    // macOS 코드 서명 (GitHub Actions에서 인증서 없이도 빌드 가능)
    osxSign: process.env.CSC_LINK ? {} : undefined,
  },
  rebuildConfig: {},

  makers: [
    // ──────────────────────────────────────────
    // Windows — Squirrel 인스톨러 (.exe)
    // ──────────────────────────────────────────
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'XPIDERBrowser',
        authors: 'XPIDER',
        description: 'XPIDER Custom Cloud Browser',
        exe: 'XPIDERBrowser.exe',
        setupExe: 'XPIDER_Browser_Setup.exe',
        setupIcon: './assets/icons/win/icon.ico',
      },
    },

    // ──────────────────────────────────────────
    // macOS — DMG 인스톨러
    // ──────────────────────────────────────────
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        name: 'XPIDER Browser',
        icon: './assets/icons/mac/icon.icns',
        format: 'ULFO',
      },
    },

    // ──────────────────────────────────────────
    // 포터블 ZIP — 다중 설치용 (Win + Mac)
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

  publishers: [
    // GitHub Releases 자동 배포
    // {
    //   name: '@electron-forge/publisher-github',
    //   config: {
    //     repository: { owner: 'YOUR_GITHUB_ID', name: 'xpider-browser' },
    //     prerelease: false,
    //   },
    // },
  ],
};
