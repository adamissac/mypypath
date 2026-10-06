import { randomUUID } from 'node:crypto';
import { load } from 'cheerio';
import { fetchDirectory } from './public-school-web.js';
import { resolveInstitution, schoolNamespace, httpsSource, hostWithin } from './institution-registry.js';

// Legacy candidate helper, not an approval boundary. resolveInstitution below
// independently establishes the institution before any staff match can count.
export function institutionalHost(email) {
  if (typeof email !== 'string') return null;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain || !/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(domain)) return null;
  const consumer = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com']);
  if (consumer.has(domain)) return null;
  const labels = domain.split('.');
  const suffix = labels.at(-1);
  const states = new Set('al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc'.split(' '));
  const k12 = labels.length >= 4 && labels.at(-3) === 'k12' && labels.at(-1) === 'us' && states.has(labels.at(-2));
  const supported = suffix === 'edu' || suffix === 'org' || suffix === 'school' || suffix === 'academy' || k12;
  return supported ? schoolNamespace(domain) || domain.replace(/^www\./, '') : null;
}
// Email remains exact. Names tolerate titles, accents, punctuation, middle
// names/initials, and surname-first directories, but never fuzzy surnames.
export function nameMatches(listed, supplied) {
  const tokens = value => {
    let text = value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
    if (text.includes(',')) { const [last, ...first] = text.split(','); text = first.join(' ') + ' ' + last; }
    return text.replace(/\b(mr|mrs|ms|miss|dr|prof|professor|phd|edd)\b\.?/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/);
  };
  const a = tokens(listed), b = tokens(supplied);
  return a.length >= 2 && b.length >= 2 && a[0] === b[0] && a.at(-1) === b.at(-1)
    && (a.length === 2 || b.length === 2 || a.slice(1, -1).map(t => t[0]).join('') === b.slice(1, -1).map(t => t[0]).join(''));
}
const ENTRY_SELECTOR = [
  'tr', 'li', 'article', '[itemtype$="/Person"]', '[data-staff-member]',
  '.staff-card', '.staff-member', '.staff-item', '.faculty-card', '.faculty-member',
  '.directory-card', '.directory-item', '.person-card', '.fsConstituentItem',
].join(',');
const NAME_SELECTOR = '[itemprop~="name"],.name,.staff-name,.faculty-name,.directory-name,.fsFullName,h1,h2,h3,h4,h5,h6';
const EMAIL_PATTERN = /[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
function normalize(value) { return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase(); }
function nodeText(node) {
  if (node.type === 'text') return node.data;
  return (node.children || []).map(nodeText).join(' ');
}
function publicDocument(html) {
  const $ = load(html);
  $('script,style,noscript,template,[hidden],[aria-hidden="true"]').remove();
  $('[style]').each((_, el) => {
    if (/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test($(el).attr('style'))) $(el).remove();
  });
  return $;
}
function teachingRole(value) {
  const role = normalize(value).replace(/^[\s—–|,:;-]+|[\s—–|,:;-]+$/g, '');
  // An explicit position, not prose such as "contact a teacher", a directory
  // heading, or an adjacent non-teaching role containing the word teacher.
  if (role.length > 100 || /\b(student|pupil|parent|guardian|volunteer|aide|retired|former|principal|counselor|nurse|administrator|secretary|coordinator|director|superintendent|contact|ask|meet|email|not|no|non|directory|association)\b/.test(role)
      || (/\bassistant\b/.test(role) && !/\bassistant professor\b/.test(role))) return false;
  return /^(?:[\p{L}\p{N}&/'().-]+\s+){0,5}(?:teacher|instructor|educator|professor)(?:\s*(?:[—–,:/|()-]|of\b|for\b)\s*[\p{L}\p{N}\s&/'().-]+)?$/u.test(role)
    || /^(?:faculty|faculty member)$/.test(role);
}
function entryIdentity($, entry) {
  const copy = $(entry).clone();
  const addresses = new Set((nodeText(entry).match(EMAIL_PATTERN) || []).map(email => email.toLowerCase()));
  copy.find('a[href]').each((_, anchor) => {
    const href = $(anchor).attr('href');
    if (!/^mailto:/i.test(href)) return;
    try {
      const email = decodeURIComponent(href.slice(7).split('?')[0]).toLowerCase();
      if (email.match(EMAIL_PATTERN)?.join('') !== email) return;
      addresses.add(email);
      $(anchor).text(email);
    } catch { /* Malformed mailto links cannot support identity. */ }
  });
  return { addresses: [...addresses], text: normalize(nodeText(copy[0])) };
}
export function teacherEvidence(html, name, email) {
  const $ = publicDocument(html);
  const normalizedName = normalize(name);
  const normalizedEmail = email.toLowerCase();
  // Simple published rows can put all three fields in a single paragraph.
  // Require name first and email last, with only an explicit role between them.
  // This prevents an adjacent person's name/role from supplying the evidence.
  for (const paragraph of $('p').toArray()) {
    const identity = entryIdentity($, paragraph);
    if (identity.addresses.length !== 1 || identity.addresses[0] !== normalizedEmail || identity.text.length > 800) continue;
    if (!identity.text.startsWith(normalizedName)) continue;
    const rest = identity.text.slice(normalizedName.length);
    if (!/^[\s—–|,:;-]/.test(rest)) continue;
    const emailAt = rest.indexOf(normalizedEmail);
    if (emailAt < 0 || rest.slice(emailAt + normalizedEmail.length).replace(/[\s—–|,;:.()-]/g, '')) continue;
    if (teachingRole(rest.slice(0, emailAt))) return true;
  }
  // Structured cards/rows must carry their own name and role fields. Never
  // combine an outer directory wrapper or two nested person entries.
  for (const entry of $(ENTRY_SELECTOR).toArray()) {
    if ($(entry).find(ENTRY_SELECTOR).length) continue;
    const identity = entryIdentity($, entry);
    if (identity.addresses.length !== 1 || identity.addresses[0] !== normalizedEmail || identity.text.length > 1000) continue;
    const names = [...new Set($(entry).find(NAME_SELECTOR).toArray().map(el => normalize(nodeText(el))).filter(Boolean))];
    const leaves = $(entry).find('*').toArray().filter(el => !$(el).children().length);
    if (!names.length && ['article', 'li'].includes(entry.name)) continue;
    if (names.length ? names.length !== 1 || !nameMatches(names[0], normalizedName)
      : !leaves.some(el => nameMatches(nodeText(el), normalizedName))) continue;
    if (leaves.some(el => normalize(nodeText(el)) !== normalizedName && teachingRole(nodeText(el)))) return true;
  }
  return false;
}
export function directoryLinks(html, homepage, hosts) {
  const base = new URL(homepage);
  const root = base.hostname.replace(/^www\./, '');
  const allowedHosts = new Set(hosts || [root, `www.${root}`]);
  const $ = publicDocument(html);
  const links = [];
  for (const anchor of $('a[href]').toArray()) {
    try {
      const url = new URL($(anchor).attr('href'), base);
      if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || url.username || url.password || url.port) continue;
      if (!/staff|faculty|directory|teachers/i.test(url.pathname + ' ' + nodeText(anchor))) continue;
      url.hash = '';
      if (!links.includes(url.href)) links.push(url.href);
    } catch { /* Ignore malformed links. */ }
  }
  return links.slice(0, 3);
}
export async function automaticTeacherCheck({ db, uid, email, fullName, directoryUrl = '', registryUrl = '', fetchPage = fetchDirectory, resolveSchool = resolveInstitution, now = Date.now() }) {
  if (typeof fullName !== 'string' || fullName.trim().length < 3 || fullName.length > 100) {
    throw Object.assign(new Error('Enter your name as listed by your school.'), { status: 400 });
  }
  if (typeof directoryUrl !== 'string' || directoryUrl.length > 1500 || typeof registryUrl !== 'string' || registryUrl.length > 1500) {
    throw Object.assign(new Error('Use a valid school directory link.'), { status: 400 });
  }
  const ref = db.doc(`teacherVerificationRequests/${uid}`);
  const checkId = randomUUID();
  await db.runTransaction(async tx => {
    const previous = await tx.get(ref);
    const prior = previous.exists ? previous.data() : null;
    const sameIdentity = prior?.email === email;
    const windowStart = sameIdentity ? (prior.windowStartedAt || prior.requestedAt) : now;
    const recent = sameIdentity && now - windowStart < 86400000;
    const inProgress = prior?.status === 'checking' && now - prior.requestedAt < 120000;
    const recovering = prior?.status === 'checking' && !inProgress;
    const changedName = prior?.fullName?.trim().toLowerCase() !== fullName.trim().toLowerCase()
      || (prior?.directoryUrl || '') !== directoryUrl || (prior?.registryUrl || '') !== registryUrl;
    const attempts = recent ? (prior.attemptsInWindow || 1) : 0;
    const correction = changedName && ['not-verified', 'needs-information', 'source-unavailable'].includes(prior?.status) && attempts < 3;
    const retryOutage = prior?.status === 'source-unavailable' && now - prior.requestedAt >= 300000 && attempts < 3;
    const legacy = prior && prior.method !== 'official-directory-v2';
    if (recent && !legacy && !recovering && !correction && !retryOutage) {
      throw Object.assign(new Error(inProgress ? 'An automatic check is already running.'
        : 'Another automatic check is available after 24 hours.'), { status: 429 });
    }
    tx.set(ref, { uid, email, fullName: fullName.trim(), directoryUrl, registryUrl, requestedAt: now, checkId,
      windowStartedAt: recent ? windowStart : now,
      attemptsInWindow: recovering && recent ? attempts : attempts + 1,
      status: 'checking', method: 'official-directory-v2', schoolAuthorization: false, evidence: [] });
  });
  async function save(result) {
    await db.runTransaction(async tx => {
      const latest = await tx.get(ref);
      if (latest.exists && latest.data().checkId === checkId) tx.set(ref, result, { merge: true });
    });
    return result;
  }
  let institution;
  try { institution = await resolveSchool({ email, directoryUrl, registryUrl, fetchPage }); }
  catch (error) {
    await save({ status: error.status === 400 ? 'needs-information' : 'source-unavailable', checkedAt: now, retryAt: now + 300000 });
    if (error.status === 400) throw error;
    return { status: 'source-unavailable' };
  }
  if (!institution) return save({ status: 'needs-information', reason: 'institution-not-found', checkedAt: now, retryAt: now + 86400000 });
  const homepage = institution.homepage;
  const evidence = [];
  const hosts = [...new Set(institution.roots.flatMap(root => [root, 'www.' + root]))];
  const suggested = httpsSource(directoryUrl);
  if (suggested && institution.roots.some(root => hostWithin(suggested.hostname, root))) hosts.push(suggested.hostname);
  let matched = false;
  async function inspect(source) {
    try {
      const html = await fetchPage(source, hosts);
      const supports = teacherEvidence(html, fullName, email);
      evidence.push({ source, checkedAt: now, result: supports ? 'name-email-teaching-role-matched' : 'no-match' });
      if (supports) matched = true;
      return html;
    } catch { evidence.push({ source, checkedAt: now, result: 'source-unavailable' }); return null; }
  }
  if (suggested && hosts.includes(suggested.hostname)) await inspect(suggested.href);
  const home = !matched ? await inspect(homepage) : null;
  if (home && !matched) {
    const links = directoryLinks(home, homepage, hosts).filter(url => url !== suggested?.href);
    await Promise.all(links.map(inspect));
  }
  const unavailable = evidence.every(entry => entry.result === 'source-unavailable');
  return save({ status: matched ? 'affiliation-verified-automatically' : unavailable ? 'source-unavailable' : 'needs-information',
    method: 'official-directory-v2', evidence, institution,
    checkedAt: now, expiresAt: matched ? now + 30 * 86400000 : now, retryAt: now + (unavailable ? 300000 : 86400000), schoolAuthorization: false });
}
