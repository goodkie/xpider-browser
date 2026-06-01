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
        name: 'XPIDER-Browser',
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
      const https = require('https');

      // ─── 리다이렉트를 지원하는 다운로드 유틸리티 ───
      function downloadFileRedirect(url, destPath) {
        return new Promise((resolve, reject) => {
          const file = fs.createWriteStream(destPath);
          const request = https.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
              file.close();
              try { fs.unlinkSync(destPath); } catch (_) {}
              return downloadFileRedirect(response.headers.location, destPath).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
              file.close();
              try { fs.unlinkSync(destPath); } catch (_) {}
              return reject(new Error(`Status Code: ${response.statusCode}`));
            }
            response.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve();
            });
          });
          request.on('error', (err) => {
            file.close();
            try { fs.unlinkSync(destPath); } catch (_) {}
            reject(err);
          });
        });
      }

      // 가이드 PDF 복사 및 Windows 7 Shim DLL 주입
      for (const outputPath of packageResult.outputPaths) {
        // 1. 가이드 PDF 복사
        const pdfSource = path.join(process.cwd(), 'XPIDER_Installation_Guide.pdf');
        const pdfDest = path.join(outputPath, 'XPIDER_Installation_Guide.pdf');
        if (fs.existsSync(pdfSource)) {
          fs.copyFileSync(pdfSource, pdfDest);
          console.log(`[XPIDER Hook] Copied guide PDF to installer root: ${pdfDest}`);
        }

        // 2. Windows 7 호환성용 Shim DLL 주입 (win32 64비트 빌드 대상)
        if (outputPath.includes('win32') && outputPath.includes('x64')) {
          console.log(`[XPIDER Hook] Windows x64 빌드 감지 - Windows 7 호환성 Shim DLL 주입 시작...`);
          
          const shimCacheDir = path.join(process.cwd(), 'assets', 'shims', 'win7', 'x64');
          if (!fs.existsSync(shimCacheDir)) {
            fs.mkdirSync(shimCacheDir, { recursive: true });
          }

          const shimDllPath = path.join(shimCacheDir, 'api-ms-win-core-path-l1-1-0.dll');
          const downloadUrl = 'https://github.com/nalexandru/api-ms-win-core-path-HACK/releases/download/0.2.1/api-ms-win-core-path-blender.zip';
          const tempZipPath = path.join(shimCacheDir, 'temp_shim.zip');

          if (!fs.existsSync(shimDllPath)) {
            console.log(`[XPIDER Hook] Shim DLL 캐시가 존재하지 않습니다. ZIP 다운로드 중: ${downloadUrl}`);
            try {
              await downloadFileRedirect(downloadUrl, tempZipPath);
              console.log(`[XPIDER Hook] ZIP 다운로드 완료! 압축 해제 중...`);
              
              const AdmZip = require('adm-zip');
              const zip = new AdmZip(tempZipPath);
              const zipEntries = zip.getEntries();
              
              // ZIP 내부에서 x64/api-ms-win-core-path-l1-1-0.dll 찾기
              const targetEntry = zipEntries.find(entry => 
                entry.entryName.includes('x64/api-ms-win-core-path-l1-1-0.dll')
              );
              
              if (targetEntry) {
                // targetEntry 내용을 shimCacheDir에 api-ms-win-core-path-l1-1-0.dll 이름으로 저장
                const dllBuffer = zip.readFile(targetEntry);
                fs.writeFileSync(shimDllPath, dllBuffer);
                console.log(`[XPIDER Hook] Shim DLL 압축 해제 및 캐시 성공!`);
              } else {
                throw new Error('ZIP 내부에 x64/api-ms-win-core-path-l1-1-0.dll 파일이 존재하지 않습니다.');
              }
              
              // 임시 ZIP 제거
              try { fs.unlinkSync(tempZipPath); } catch (_) {}
            } catch (err) {
              console.error(`[XPIDER Hook] Shim DLL 자동 빌드 구성 실패: ${err.message}`);
              try { if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath); } catch (_) {}
              console.log(`[XPIDER Hook] 로컬 빌드를 완료하기 위해 계속 진행합니다. (오프라인 경고)`);
            }
          }

          // 캐시된 DLL 복사
          if (fs.existsSync(shimDllPath)) {
            const destDllPath = path.join(outputPath, 'api-ms-win-core-path-l1-1-0.dll');
            fs.copyFileSync(shimDllPath, destDllPath);
            console.log(`[XPIDER Hook] Windows 7 Shim DLL 복사 완료! -> ${destDllPath}`);
          } else {
            console.warn(`[XPIDER Hook] 경고: Shim DLL 파일이 존재하지 않아 패치를 생략합니다.`);
          }
        }
      }
    }
  }
};
