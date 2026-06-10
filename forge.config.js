const fs = require('fs');

const extraResources = ['./extensions', './XPIDER_Installation_Guide.pdf'];
if (fs.existsSync('./.env')) {
  extraResources.push('./.env');
}

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'XPIDER Browser',
    executableName: 'XPIDERBrowser',
    extraResource: extraResources,
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
      /^\/XPIDER_Admin_Manual_v1\.pdf$/,
      /^\/XPIDER_Landing_Plan\.pdf$/,
      /^\/[^\/]*\.(png|jpg|jpeg|JPG)$/,
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
      config: (arch) => ({
        name: 'XPIDERBrowser',
        format: 'UDZO',
        icon: './assets/icons/mac/icon.icns',
        contents: [
          {
            x: 130,
            y: 220,
            type: 'file',
            path: require('path').join(process.cwd(), 'out', `XPIDER Browser-darwin-${arch}`, 'XPIDER Browser.app')
          },
          {
            x: 410,
            y: 220,
            type: 'link',
            path: '/Applications'
          },
          {
            x: 270,
            y: 340,
            type: 'file',
            path: require('path').join(process.cwd(), 'XPIDER_Installation_Guide.pdf')
          }
        ]
      }),
    },
  ],

  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
  hooks: {
    postPackage: async (forgeConfig, packageResult) => {
      const fs = require('fs');
      const path = require('path');
      for (const outputPath of packageResult.outputPaths) {
        const pdfSource = path.join(process.cwd(), 'XPIDER_Installation_Guide.pdf');
        const pdfDest = path.join(outputPath, 'XPIDER_Installation_Guide.pdf');
        if (fs.existsSync(pdfSource)) {
          fs.copyFileSync(pdfSource, pdfDest);
          console.log(`[XPIDER Hook] Copied guide PDF to installer root: ${pdfDest}`);
        }
      }
    }
  }
};
