const https = require('https');

const GITHUB_TOKEN = ''; // 토큰 없이 공용 요청
const REPO_OWNER = 'goodkie';
const REPO_NAME = 'xpider-browser';

function githubGet(apiPath) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'XPIDER-Browser-Updater',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
    }
    
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      headers: headers
    };
    
    const req = https.get(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  try {
    const res = await githubGet(`/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`);
    console.log("Status:", res.status);
    if (res.status === 200) {
      console.log("Tag:", res.body.tag_name);
      console.log("Assets:");
      res.body.assets.forEach(a => {
        console.log(`- ${a.name}: ${a.browser_download_url}`);
      });
    } else {
      console.log("Error body:", res.body);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
