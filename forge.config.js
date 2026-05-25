module.exports = {
  packagerConfig: {
    asar: true,
    name: 'XPIDER Browser',
    // macOS에서 executableName 불일치로 인한 실행 불가 버그 방지
    executableName: process.platform === 'win32' || process.platform === 'linux' ? 'XPIDERBrowser' : undefined,
    extraResource: ['./extensions'],
    icon: './assets/icons/win/icon',
    appBundleId: 'com.xpider.browser',
    appVersion: require('./package.json').version,
    osxSign: process.env.CSC_LINK ? {} : undefined,
    extendInfo: {
      LSMinimumSystemVersion: '10.15.0', // 구형 macOS 호환성 보장
    },
    ignore: [
      /^\/data($|\/)/,
      /^\/backups($|\/)/,
      /^\/_snapshots_full($|\/)/,
      /^\/_RESTORE_POINTS($|\/)/,
      /^\/restore_points($|\/)/,
      /^\/snapshots($|\/)/,
      /^\/portable_temp($|\/)/,
      /^\/out($|\/)/,
      /^\/xpider_/,
      /^\/extension_logs/,
      /^\/\.git($|\/)/,
      // 루트 디렉토리의 빌드 산출물 (.exe, .zip) 및 스크린샷/도큐먼트 제외
      /^\/XPIDER-Browser-Windows-.*\.exe$/,
      /^\/XPIDER-Browser-Windows-.*\.zip$/,
      /^\/.*\.lnk$/,
      /^\/.*\.zip$/,
      /^\/.*\.exe$/,
      /^\/.*\.pdf$/,
      /^\/.*\.(png|jpg|jpeg|JPG)$/,
      /^\/.*_debug\.txt$/,
      /^\/extension_logs.*$/,
      /^\/최신 상태의 압축 패키지 백업.*$/,
      /^\/캡처.*$/,

    ],
  },
  rebuildConfig: {},

  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'XPIDERBrowser',
        setupExe: `XPIDER-Browser-Windows-v${require('./package.json').version}-Setup.exe`,
        setupIcon: './assets/icons/win/icon.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32', 'darwin'],
      config: {},
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        name: 'XPIDER-Browser',
        format: 'UDZO',
        icon: './assets/icons/mac/icon.icns'
      },
    },
  ],

  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
