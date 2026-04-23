const fs = require('fs');

const content = fs.readFileSync('background.js', 'utf8');
const lines = content.split('\n');

let balance = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '(') balance++;
        else if (char === ')') balance--;

        if (balance < 0) {
            console.log(`NEGATIVE BALANCE ${balance} at line ${lineNum}, char ${j + 1}: ${line.trim()}`);
            // Reset balance to 0 to find next negative
            balance = 0;
        }
    }
}
console.log(`Final Balance: ${balance}`);
