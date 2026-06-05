// api.js
// WebShare API key embedded — users never need to configure anything
const API_KEY = 'h4o8ksxhv8lnvq19hpbthqshgbfcwoq67t6gnga1';

/**
 * Fetch the proxy list from WebShare.
 * Each proxy already has a dedicated username + password assigned by WebShare.
 * We use these credentials directly — no IP whitelisting needed.
 */
export async function getProxyList() {
  const res = await fetch(
    'https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=25',
    { headers: { Authorization: `Token ${API_KEY}` } }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WebShare API error ${res.status}: ${body}`);
  }

  const data = await res.json();

  return data.results.map((p) => ({
    id: p.id,
    name: `${flag(p.country_code)} ${p.country_code} — ${p.proxy_address}`,
    host: p.proxy_address,
    port: p.port,          // HTTP port (always available on Direct plan)
    username: p.username,  // Per-proxy credential from WebShare
    password: p.password,
    country: p.country_code,
  }));
}

function flag(cc) {
  if (!cc) return '🌐';
  return [...cc.toUpperCase()].map(c => String.fromCodePoint(c.charCodeAt(0) + 127397)).join('');
}
