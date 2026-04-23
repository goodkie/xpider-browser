const fs = require('fs');

const content = fs.readFileSync('background.js', 'utf8');

let balance = 0;
let inString = null; // ' " `
let inComment = null; // // /*

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const prev = content[i - 1];
    const next = content[i + 1];

    // Handle comments
    if (!inString && !inComment) {
        if (char === '/' && next === '/') {
            inComment = '//';
            i++; continue;
        }
        if (char === '/' && next === '*') {
            inComment = '/*';
            i++; continue;
        }
    } else if (inComment === '//') {
        if (char === '\n') {
            inComment = null;
        }
        continue;
    } else if (inComment === '/*') {
        if (char === '*' && next === '/') {
            inComment = null;
            i++;
        }
        continue;
    }

    if (inComment) continue;

    // Handle strings
    if (!inString) {
        if (char === "'" || char === '"' || char === "`") {
            inString = char;
            continue;
        }
    } else {
        if (char === inString && prev !== '\\') {
            inString = null;
        }
        continue;
    }

    if (inString) continue;

    // Count parens
    if (char === '(') balance++;
    else if (char === ')') {
        balance--;
        if (balance < 0) {
            // Find line number
            const linesSoFar = content.substring(0, i + 1).split('\n');
            const lineNum = linesSoFar.length;
            console.log(`EXTRA ) at line ${lineNum}: ${linesSoFar[lineNum - 1].trim()}`);
            balance = 0; // reset
        }
    }
}

console.log(`Final structural balance: ${balance}`);
