const https = require('https');
const PAT = 'sbp_63de657cd767f264947a1e41ffce16d6a51c5423';
const PROJECT = 'gfgudbxpkpfevsuobdmr';

function execSQL(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function checkPolicies() {
  const sql = `
    SELECT policyname, permissive, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE tablename = 'profiles';
  `;
  
  const r1 = await execSQL(sql);
  console.log(JSON.stringify(JSON.parse(r1.body), null, 2));
}

checkPolicies().catch(console.error);
