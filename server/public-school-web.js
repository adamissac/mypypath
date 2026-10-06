import https from 'node:https';
import { resolve4 } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export function publicAddress(address) {
  try { return ipaddr.parse(address).kind() === 'ipv4' && ipaddr.parse(address).range() === 'unicast'; }
  catch { return false; }
}
export function directoryUrl(raw, hosts) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !hosts.includes(url.hostname) || ipaddr.isValid(url.hostname)) throw new Error('Invalid source');
  return url;
}
export async function fetchDirectory(raw, hosts, redirects = 0, deadline = Date.now() + 8000) {
  if (Date.now() >= deadline) throw new Error('Source timeout');
  const url = directoryUrl(raw, hosts);
  let dnsTimer;
  const addresses = await Promise.race([resolve4(url.hostname), new Promise((_, reject) => {
    dnsTimer = setTimeout(() => reject(new Error('DNS timeout')), Math.min(3000, deadline - Date.now()));
  })]).finally(() => clearTimeout(dnsTimer));
  if (!addresses.length || !addresses.every(publicAddress)) throw new Error('Unsafe address');
  // Pin DNS for each connection, including separately validated redirects.
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent: false,
      lookup: (_host, options, callback) => options.all
        ? callback(null, [{ address: addresses[0], family: 4 }])
        : callback(null, addresses[0], 4),
      headers: { 'User-Agent': 'PyPath-SchoolReview/1.0', Accept: 'text/html', 'Accept-Encoding': 'identity' },
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        const location = res.headers.location;
        res.destroy();
        if (redirects >= 2 || !location) { reject(new Error('Redirect limit')); return; }
        try {
          const next = directoryUrl(new URL(location, url).href, hosts);
          fetchDirectory(next.href, hosts, redirects + 1, deadline).then(resolve, reject);
        } catch { reject(new Error('Unsafe redirect')); }
        return;
      }
      if (res.statusCode !== 200 || !/^text\/html\b/i.test(res.headers['content-type'] || '')) {
        res.destroy(); reject(new Error('Source unavailable')); return;
      }
      let size = 0; const chunks = [];
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 1024 * 1024) { req.destroy(new Error('Source too large')); return; }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    const timer = setTimeout(() => req.destroy(new Error('Source timeout')), Math.max(1, deadline - Date.now()));
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
  });
}
