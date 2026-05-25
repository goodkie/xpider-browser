const fs = require('fs');
const path = require('path');

function findManifests(dir) {
  const results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      const manifestPath = path.join(filePath, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          results.push({
            folder: file,
            name: manifest.name || 'N/A',
            version: manifest.version || '0.0.0'
          });
        } catch (e) {
          results.push({
            folder: file,
            name: 'Error parsing manifest',
            version: 'N/A'
          });
        }
      }
    }
  });
  return results;
}

const extDir = 'e:/vivpr/ai/xpider-trial/extensions';
console.log("=== Active Extensions containing manifest.json ===");
const manifests = findManifests(extDir);
console.log(JSON.stringify(manifests, null, 2));
