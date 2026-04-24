const fs = require('fs');
let buildYml = fs.readFileSync('.github/workflows/build.yml', 'utf8');
buildYml = buildYml.replace(/out\/make\/dmg\/x64\/\*\.dmg/g, 'out/make/**/*.dmg');
buildYml = buildYml.replace(/out\/make\/dmg\/arm64\/\*\.dmg/g, 'out/make/**/*.dmg');
fs.writeFileSync('.github/workflows/build.yml', buildYml, 'utf8');
console.log('build.yml fixed');
