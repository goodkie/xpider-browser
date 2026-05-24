const fs = require('fs');
const path = require('path');

const p = 'package.json';
let c = JSON.parse(fs.readFileSync(p));
let [ma, mi, pa] = c.version.split('.');
c.version = `${ma}.${mi}.${parseInt(pa) + 1}`;
fs.writeFileSync(p, JSON.stringify(c, null, 2) + '\n');
console.log(`package.json -> ${c.version}`);

const d = 'extensions';
fs.readdirSync(d).forEach(e => {
    const m = path.join(d, e, 'manifest.json');
    if (fs.existsSync(m)) {
        let mc = JSON.parse(fs.readFileSync(m));
        if (mc.version) {
            let [m_ma, m_mi, m_pa] = mc.version.split('.');
            mc.version = `${m_ma}.${m_mi}.${parseInt(m_pa) + 1}`;
            fs.writeFileSync(m, JSON.stringify(mc, null, 2) + '\n');
            console.log(`${e}/manifest.json -> ${mc.version}`);
        }
    }
});
