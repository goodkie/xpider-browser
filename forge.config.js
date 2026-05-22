module.exports = {
  packagerConfig: {
    asar: true,
    name: 'XPIDER Browser',
    executableName: 'XPIDERBrowser',
    extraResource: ['./extensions'],
    icon: './assets/icons/win/icon',
    appBundleId: 'com.xpider.browser',
    appVersion: require('./package.json').version,
    osxSign: process.env.CSC_LINK ? {} : undefined,
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
        setupExe: `XPIDER-Browser-Windows-v${require('./package.json').version}-Silent-Installer.exe`,
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
