const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const zip = new AdmZip();
const outputZip = path.join(__dirname, '..', 'XPIDER_Project_Complete_Backup.zip');
const excludeDirs = ['node_modules', '.git', 'out', 'snapshots', 'portable_temp', 'backups', 'scratch'];
const excludeExtensions = ['.exe', '.zip', '.rar', '.lnk', '.psd'];

function addFolderToZip(dir, zipPath = '') {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);
    const localPath = zipPath ? path.join(zipPath, file) : file;
    
    if (stat.isDirectory()) {
      if (!excludeDirs.includes(file)) {
        addFolderToZip(filepath, localPath);
      }
    } else {
      const ext = path.extname(file).toLowerCase();
      if (excludeExtensions.includes(ext) || file === 'XPIDER_Project_Complete_Backup.zip') continue;
      
      // 대용량 백업 텍스트 파일(구버전 57MB짜리 백업 등) 제외
      if (file.startsWith('xpider_') && file.endsWith('.txt') && stat.size > 5 * 1024 * 1024) continue;
      
      zip.addLocalFile(filepath, zipPath);
    }
  }
}

console.log('Zipping complete project files (excluding node_modules, .git, out, exe, zip, psd)...');
addFolderToZip(path.join(__dirname, '..'));
zip.writeZip(outputZip);
console.log(`Success! Complete project backup zipped at: ${outputZip}`);
