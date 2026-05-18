const fs = require('fs');
const path = require('path');

const replacements = [
    [/Google Maps/g, 'Bing Maps'],
    [/구글 지도/g, '빙 지도'],
    [/GMaps/g, 'BingMaps'],
    [/google\.com\/maps/g, 'bing.com/maps']
];

const files = fs.readdirSync('.').filter(f => f.match(/\.(js|html|css|json)$/));

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    replacements.forEach(([regex, replacement]) => {
        content = content.replace(regex, replacement);
    });
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
});
