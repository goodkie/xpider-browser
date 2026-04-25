module.exports = {
  packagerConfig: {
    asar: true,
    name: 'XPIDER Browser',
    executableName: 'XPIDERBrowser',
    extraResource: ['./extensions'],
    icon: './assets/icons/win/icon',  // .ico (Win) / .icns (Mac) 자동 선택
    appBundleId: 'com.xpider.browser',
    appVersion: require('./package.json').version,
    osxSign: process.env.CSC_LINK ? {} : undefined,
  },
  rebuildConfig: {},

  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32', 'darwin'],
      config: {},
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        name: 'XPIDER_Browser',
        format: 'ULFO',
        window: { width: 600, height: 400 },
        icon: './assets/icons/mac/icon.icns'
      }
    },
  ],

  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
