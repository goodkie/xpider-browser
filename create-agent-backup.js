const fs = require('fs');
const path = require('path');

const outputFile = path.join(__dirname, 'xpider_agent_backup.txt');
const extensions = ['.js', '.html', '.css', '.cs', '.json', '.md', '.sql'];
const excludeDirs = ['node_modules', '.git', 'out', 'snapshots', 'portable_temp', 'assets', 'colors-logo-template-2023-11-27-04-58-44-utc', 'drone-x-logo-template-2023-11-27-04-53-46-utc', 'test_ext'];

function walkSync(dir, filelist = []) {
  if (!fs.existsSync(dir)) return filelist;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);
    if (stat.isDirectory()) {
      if (!excludeDirs.includes(file)) {
        filelist = walkSync(filepath, filelist);
      }
    } else {
      if (extensions.includes(path.extname(file))) {
        // Skip package-lock.json and this script
        if (file === 'package-lock.json' || file === 'create-agent-backup.js') continue;
        filelist.push(filepath);
      }
    }
  }
  return filelist;
}

const files = walkSync(__dirname);
let output = '# XPIDER Project Code Context for AI Agents\n\n';
output += 'This file contains the complete source code of the project, formatted for another AI agent to easily read and understand.\n\n';

for (const file of files) {
  const relativePath = path.relative(__dirname, file).replace(/\\/g, '/');
  try {
    const content = fs.readFileSync(file, 'utf8');
    output += `\n\n================================================================================\n`;
    output += `FILE: ${relativePath}\n`;
    output += `================================================================================\n\n`;
    output += content;
  } catch(e) {
    console.log(`Failed to read ${relativePath}`);
  }
}

fs.writeFileSync(outputFile, output);
console.log(`Created agent context backup: ${outputFile}`);
