const fs = require('fs');
const path = require('path');

const targetPath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

function addEarlyLogs() {
    let content = fs.readFileSync(targetPath, 'utf8');

    // Add immediate sendLog at the start of onMessage 'startSearch'
    content = content.replace('startSearchProcess(m.text, m.collectEmails);', 
        'sessionLogs = [\'[System] Starting Text List Extraction...\'];\n        isSearching = true;\n        startSearchProcess(m.text, m.collectEmails);');

    // Add another log inside startSearchProcess before HL/GL loading
    content = content.replace('async function startSearchProcess(rawText, collectEmails = false) {', 
        'async function startSearchProcess(rawText, collectEmails = false) {\n    sendLog(\'🚀 Initializing text processor...\');');

    fs.writeFileSync(targetPath, content, { encoding: 'utf8' });
    console.log('EARLY LOGS ADDED.');
}

addEarlyLogs();
