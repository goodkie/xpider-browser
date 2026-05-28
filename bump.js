const fs = require('fs');
const path = require('path');

const p = 'package.json';
let c = JSON.parse(fs.readFileSync(p));
let [ma, mi, pa] = c.version.split('.');
c.version = `${ma}.${mi}.${parseInt(pa) + 1}`;
fs.writeFileSync(p, JSON.stringify(c, null, 2) + '\n');
console.log(`package.json -> ${c.version}`);

// [v18.46.0] extensions 외에 루트의 send_message 폴더도 같이 갱신
const extraDirs = ['extensions', 'send_message'];
extraDirs.forEach(d => {
    if (!fs.existsSync(d)) return;
    const stat = fs.statSync(d);
    if (stat.isDirectory()) {
        if (d === 'send_message') {
            const m = path.join(d, 'manifest.json');
            if (fs.existsSync(m)) {
                let mc = JSON.parse(fs.readFileSync(m));
                if (mc.version) {
                    let [m_ma, m_mi, m_pa] = mc.version.split('.');
                    mc.version = `${m_ma}.${m_mi}.${parseInt(m_pa) + 1}`;
                    fs.writeFileSync(m, JSON.stringify(mc, null, 2) + '\n');
                    console.log(`send_message/manifest.json -> ${mc.version}`);
                }
            }
        } else {
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
        }
    }
});
