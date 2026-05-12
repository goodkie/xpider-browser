const fs = require('fs');
const path = 'e:\\vivpr\\ai\\collect-list\\extension\\translations.js';

function repair() {
    console.log('Reading file...');
    const buffer = fs.readFileSync(path);
    console.log('File size:', buffer.length);
    console.log('First 20 bytes:', buffer.slice(0, 20).toString('hex'));

    let content = '';

    // Detect BOM
    if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        console.log('UTF-8 BOM detected.');
        content = buffer.slice(3).toString('utf8');
    } 
    // Detect UTF-16LE
    else if (buffer[1] === 0x00 && buffer[3] === 0x00) {
        console.log('UTF-16LE detected.');
        content = buffer.toString('utf16le');
    }
    // Detect UTF-16BE
    else if (buffer[0] === 0x00 && buffer[2] === 0x00) {
        console.log('UTF-16BE detected.');
        content = buffer.toString('utf16be');
    }
    else {
        console.log('Attempting UTF-8 decode...');
        content = buffer.toString('utf8');
    }

    if (content.includes('I18N_DATA')) {
        console.log('Valid data found. Applying branding...');
        // Standardize the title globally
        content = content.replace(/"app_title":\s*"[^"]*"/g, '"app_title": "X PIDER-Local Business Data Crawler"');
        
        // Write back as UTF-8 without BOM
        fs.writeFileSync(path, content, { encoding: 'utf8' });
        console.log('Success! translations.js is now clean UTF-8.');
    } else {
        console.error('Failure: Could not find I18N_DATA in any common encoding.');
        process.exit(1);
    }
}

repair();
