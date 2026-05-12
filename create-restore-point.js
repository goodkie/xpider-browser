const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

const now = new Date();
const timestamp = now.getFullYear() + 
    String(now.getMonth() + 1).padStart(2, '0') + 
    String(now.getDate()).padStart(2, '0') + '_' + 
    String(now.getHours()).padStart(2, '0') + 
    String(now.getMinutes()).padStart(2, '0');

const zipName = `xpider_restore_point_${timestamp}.zip`;
const zip = new AdmZip();

const rootDir = __dirname;
const exclude = ['node_modules', '.git', 'out', 'snapshots', '_snapshots_full', '_RESTORE_POINTS', 'portable_temp', 'assets', 'restore_points', 'data'];
const excludeExtensions = ['.exe', '.zip', '.psd'];

function addFiles(dir) {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
        const fullPath = path.join(dir, item);
        const relPath = path.relative(rootDir, fullPath);
        
        if (exclude.some(ex => relPath === ex || relPath.startsWith(ex + path.sep))) return;
        
        const stat = fs.statSync(fullPath);
        if (!stat.isDirectory() && excludeExtensions.some(ext => item.toLowerCase().endsWith(ext))) return;
        if (stat.isDirectory()) {
            addFiles(fullPath);
        } else {
            try {
                // Use zip.addLocalFile to maintain directory structure
                const zipPath = path.dirname(relPath) === '.' ? '' : path.dirname(relPath);
                zip.addLocalFile(fullPath, zipPath);
            } catch (err) {
                console.warn(`⚠️ Skipping busy/locked file: ${relPath}`);
            }
        }
    });
}

console.log('📦 Creating restore point...');
addFiles(rootDir);
zip.writeZip(path.join(rootDir, zipName));
console.log(`✅ Success! Created restore point: ${zipName}`);
