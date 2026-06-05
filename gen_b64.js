const fs = require('fs');
const code = `// --- AUTO-INJECTED CHROME.SCRIPTING POLYFILL FOR WIN7/ELECTRON22 ---
if (typeof chrome === 'object' && typeof chrome.scripting === 'undefined') {
  chrome.scripting = {
    executeScript: function(opts, cb) {
      if (opts.func) {
        opts.code = '(' + opts.func.toString() + ')();';
        delete opts.func;
      }
      return new Promise(resolve => {
        chrome.tabs.executeScript(opts.target.tabId, opts, (res) => {
          if (cb) cb(res);
          resolve(res);
        });
      });
    }
  };
}
// -------------------------------------------------------------------

`;
fs.writeFileSync('b64.txt', Buffer.from(code).toString('base64'));
