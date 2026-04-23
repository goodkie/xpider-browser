const fs = require('fs');

const content = fs.readFileSync('background.js', 'utf8');
const linesArr = content.split('\n');

let balance = 0;
let inString = null;
let inComment = null;

for (let i = 0; i < linesArr.length; i++) {
    const line = linesArr[i];
    const lineNum = i + 1;
    let oldBalance = balance;

    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        const next = line[j + 1];

        if (!inString && !inComment) {
            if (char === '/' && next === '/') {
                inComment = '//';
                break;
            }
            if (char === '/' && next === '*') {
                inComment = '/*';
                j++; continue;
            }
        } else if (inComment === '/*') {
            if (char === '*' && next === '/') {
                inComment = null;
                j++;
            }
            continue;
        }

        if (inComment) continue;

        if (!inString) {
            if (char === "'" || char === '"' || char === "`") {
                inString = char;
                continue;
            }
        } else {
            if (char === inString && line[j - 1] !== '\\') {
                inString = null;
            }
            continue;
        }

        if (inString) continue;

        if (char === '(') balance++;
        else if (char === ')') {
            balance--;
            if (balance < 0) {
                console.log(`EXTRA ) at line ${lineNum}: ${line.trim()}`);
                balance = 0;
            }
        }
    }

    if (inComment === '//') inComment = null;

    if (balance !== oldBalance) {
        console.log(`Line ${lineNum}: Balance changed ${oldBalance} -> ${balance} | ${line.trim().substring(0, 50)}...`);
    }
}
console.log(`Final structural balance: ${balance}`);
