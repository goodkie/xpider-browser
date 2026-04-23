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
        format: 'ULFO',
        icon: './assets/icon.png'
      }
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'XPIDERBrowser',
        setupIcon: './assets/icons/win/icon.ico',
        setupExe: 'XPIDER-Browser-Windows-Setup.exe'
      }
    }
  ],

  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
