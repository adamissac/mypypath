import { load } from 'cheerio';
import { fetchDirectory } from './public-school-web.js';
import { getDomain } from 'tldts';

const STATES = new Set('al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc'.split(' '));
export function validHost(value) {
  return typeof value === 'string' && value.length <= 253
    && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value);
}
export function schoolNamespace(host) {
  if (!validHost(host)) return null;
  const labels = host.split('.');
  return labels.length >= 4 && labels.at(-3) === 'k12' && labels.at(-1) === 'us' && STATES.has(labels.at(-2))
    ? labels.slice(-4).join('.') : null;
}
export function httpsSource(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !validHost(url.hostname)) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}
export function hostWithin(host, root) { return host === root || host.endsWith('.' + root); }

// Queries contain only domain names, never the teacher's name or email.
async function rorRecords(host) {
  const url = new URL('https://api.ror.org/v2/organizations');
  const escaped = (getDomain(host, { allowPrivateDomains: true }) || host).replace(/-/g, '\\-');
  url.searchParams.set('query.advanced', `domains:"${escaped}" OR links.value:*${escaped}*`);
  url.searchParams.set('filter', 'types:education,status:active');
  const response = await fetch(url, { signal: AbortSignal.timeout(7000), redirect: 'error' });
  if (!response.ok) throw new Error('Registry unavailable');
  // Bound the response even if the registry or an upstream proxy misbehaves.
  let size = 0; const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length; if (size > 1024 * 1024) throw new Error('Registry response too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')).items || [];
}

export async function resolveInstitution({ email, directoryUrl = '', registryUrl = '', lookup = rorRecords, fetchPage = fetchDirectory }) {
  const emailHost = email?.split('@')[1]?.toLowerCase();
  const supplied = directoryUrl ? httpsSource(directoryUrl) : null;
  if (directoryUrl && !supplied) throw Object.assign(new Error('Use a public HTTPS staff-directory link.'), { status: 400 });
  const candidates = [...new Set([supplied?.hostname, emailHost].filter(validHost))];
  for (const host of candidates) {
    const root = schoolNamespace(host);
    if (root && (!supplied || hostWithin(supplied.hostname, root))) return { id: root, source: 'restricted-k12-namespace', roots: [root], homepage: `https://${root}/` };
  }
  // An NCES record is an optional independent trust anchor for schools outside
  // ROR's research-institution coverage. Only NCES's school/district detail
  // pages are accepted; a teacher-supplied website is never itself evidence.
  if (registryUrl) {
    const record = httpsSource(registryUrl);
    if (!record || record.hostname !== 'nces.ed.gov'
      || !/^\/ccd\/(schoolsearch\/school_detail|districtsearch\/district_detail)\.asp$/i.test(record.pathname)
      || !/^\d{7}(?:\d{5})?$/.test(record.searchParams.get('ID') || record.searchParams.get('ID2') || '')) {
      throw Object.assign(new Error('Use the NCES school or district detail-page link.'), { status: 400 });
    }
    const $ = load(await fetchPage(record.href, ['nces.ed.gov']));
    const roots = [];
    $('a[href]').each((_, node) => {
      const anchor = $(node); const context = anchor.closest('tr').text();
      if (!/\b(web\s*site|website)\b/i.test(context)) return;
      const link = anchor.attr('href').replace(/^http:/, 'https:');
      const website = httpsSource(link);
      if (website && website.hostname !== 'nces.ed.gov') roots.push(website.hostname.replace(/^www\./, ''));
    });
    const root = roots.find(root => candidates.some(host => hostWithin(host, root)));
    if (root) return { id: record.href, source: 'nces-directory', roots: [root], homepage: `https://${root}/` };
  }
  let outage = false;
  for (const host of candidates.slice(0, 2)) {
    let records;
    try { records = await lookup(host); }
    catch { outage = true; continue; }
    for (const record of records) {
      if (record.status !== 'active' || !record.types?.includes('education') || !/^https:\/\/ror.org\/[a-z0-9]+$/.test(record.id || '')) continue;
      const websites = (record.links || []).filter(link => link.type === 'website')
        .map(link => httpsSource(link.value?.replace(/^http:/, 'https:'))).filter(Boolean);
      const roots = [...new Set([...(record.domains || []), ...websites.map(url => url.hostname.replace(/^www\./, ''))].filter(validHost))];
      if (!roots.some(root => hostWithin(host, root))) continue;
      return { id: record.id, source: 'ror-education', roots, homepage: websites[0]?.href || `https://${roots[0]}/` };
    }
  }
  if (outage) throw new Error('Institution registry temporarily unavailable');
  return null;
}
