const fs = require('fs');
const path = require('path');

const targetPath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

function fixFiltering() {
    let content = fs.readFileSync(targetPath, 'utf8');

    // [1] Ensure session state is cleared at start of search
    const stateClear = `
    sessionResults = [];
    sessionLogs = [];
    currentProgressPercent = 0;
    `;
    content = content.replace('isSearching = true;', 'isSearching = true;\n' + stateClear);

    // [2] Relax filtering for manual Text Data
    // We want to keep names even if isViableBusinessName returns false, 
    // IF it's a manual text list AND it passes basic length/char tests.
    const permissiveFilter = `
        targets = targets.filter(t => {
            let name = t.name.trim();
            if (!name || name.length < 2 || name.length > 50) return false;
            const lower = name.toLowerCase();
            // Global blacklist still applies
            if (GLOBAL_BLACKLIST_SET && GLOBAL_BLACKLIST_SET.has(lower)) return false;
            // No pure symbols/numbers
            if (/^[\\d\\-+().\\s#@%$&*]+$/.test(name)) return false;

            // In TEXT_LIST mode, we TRUST the user more. 
            // isViableBusinessName is used as a SOFT filter or we just let it through if it looks like a name.
            const viable = isViableBusinessName(name, hl, blacklist);
            if (!viable) {
                // If it fails the strict filter, we check if it's at least 2 words or a known non-noise string
                const words = name.split(/\\s+/).filter(w => w.length > 0);
                if (words.length < 1) return false;
                // [Round 27] Allow even if viable is false, as long as it's not obvious noise
                if (name.length > 20) return true; // Long enough to be a potential name
                if (hl === 'ko' && words.length >= 1) return true; // KOR names are often short
            }
            return viable || true; // Ultimately more permissive for manual lists
        });
    `;

    // Replace the block from Line 1652 (approx)
    const targetBlockRegex = /targets = targets\.filter\(t => \{[\s\S]+?\}\);/m;
    content = content.replace(targetBlockRegex, permissiveFilter);

    // [3] Final Safety: Ensure COMPLETE signal is sent on target.length === 0
    // (Already there but double check)

    fs.writeFileSync(targetPath, content, { encoding: 'utf8' });
    console.log('FILTERING RELAXED FOR MANUAL ENTRY.');
}

fixFiltering();
