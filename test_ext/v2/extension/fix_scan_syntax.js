const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Find the specific comment and insert the missing if(isGoogle) line
    const target = '// [v25.1] Search Engine Specific Detail Extraction (Prioritize over generic regex)';
    if (content.includes(target) && !content.includes('if (isGoogle) {')) {
        content = content.replace(target, target + '\n                if (isGoogle) {');
        console.log('Syntactic fix applied.');
    } else {
        console.log('Target not found or already fixed.');
    }

    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
} catch (err) {
    console.error('Error:', err.message);
}
