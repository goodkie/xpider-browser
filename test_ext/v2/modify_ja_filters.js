const fs = require('fs');

const targetFile = 'e:\\vivpr\\ai\\collect-list\\extension\\business_filters.js';
const content = fs.readFileSync(targetFile, 'utf8');

// Looking for the specific block and removing it
const startMarker = "// [v32.0] Strict Japanese Word/Particle Count";
const endMarker = "if (totalComplexity >= complexityThreshold)";

const lines = content.split('\n');
let newLines = [];
let skipping = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(startMarker)) {
        skipping = true;
        newLines.push("            // [v33.4] Word count/Complexity limits removed for Japanese as requested.");
        continue;
    }
    
    if (skipping) {
        if (line.includes(endMarker)) {
            // Found the start of the if-block. Skip until the end of the if-block (Line 272)
            // The if block ends a few lines down at a '}'
            while (i < lines.length && !lines[i].trim().endsWith('}')) {
                i++;
            }
            skipping = false;
            continue;
        }
        continue;
    }
    
    newLines.push(line);
}

fs.writeFileSync(targetFile, newLines.join('\n'), 'utf8');
console.log('Successfully modified business_filters.js');
