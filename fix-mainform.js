const fs = require('fs');
let code = fs.readFileSync('src/deploy/XpiderSetup/MainForm.cs', 'utf8');
code = code.replace(/\\u2713/g, '');
code = code.replace(/?/g, '');
code = code.replace(/\\u00b7/g, '-');
code = code.replace(/¡¤/g, '-');
code = '\\ufeff' + code.replace(/^\\ufeff/, '');
fs.writeFileSync('src/deploy/XpiderSetup/MainForm.cs', code, 'utf8');
console.log('MainForm.cs fixed');
