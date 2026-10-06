import { randomUUID } from 'node:crypto';
import { load } from 'cheerio';
import { fetchDirectory } from './public-school-web.js';

// Initial automatic trust anchor: US public-school domains in the k12 state
// namespaces. Arbitrary .org/.com domains and personal email providers cannot
// establish institutional identity. Broader coverage requires an authoritative
// school-domain dataset, not a teacher-supplied allowlist.
export function institutionalHost(email) {
  if (typeof email !== 'string') return null;
  const domain = email.split('@')[1]?.toLowerCase();
  const states = 'al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc'.split(' ');
  const match = domain?.match(/^([a-z0-9-]+\.)+k12\.([a-z]{2})\.us$/);
  return match && states.includes(match[2]) ? domain.split('.').slice(-4).join('.') : null;
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
  if (role.length > 100 || /\b(student|pupil|parent|guardian|volunteer|assistant|aide|retired|former|principal|counselor|nurse|administrator|secretary|coordinator|director|superintendent|contact|ask|meet|email|not|no|non|directory|association)\b/.test(role)) return false;
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
    if (names.length ? names.length !== 1 || names[0] !== normalizedName
      : !leaves.some(el => normalize(nodeText(el)) === normalizedName)) continue;
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
export async function automaticTeacherCheck({ db, uid, email, fullName, fetchPage = fetchDirectory, now = Date.now() }) {
  if (typeof fullName !== 'string' || fullName.trim().length < 3 || fullName.length > 100) {
    throw Object.assign(new Error('Enter your name as listed by your school.'), { status: 400 });
  }
  const host = institutionalHost(email);
  if (!host) throw Object.assign(new Error('Automatic verification currently supports verified email addresses on US k12 state school domains. This account cannot be automatically verified yet.'), { status: 422 });
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
    const changedName = prior?.fullName?.trim().toLowerCase() !== fullName.trim().toLowerCase();
    const attempts = recent ? (prior.attemptsInWindow || 1) : 0;
    const correction = changedName && prior?.status === 'not-verified' && attempts < 2;
    if (recent && !recovering && !correction) {
      throw Object.assign(new Error(inProgress ? 'An automatic check is already running.'
        : 'Another automatic check is available after 24 hours.'), { status: 429 });
    }
    tx.set(ref, { uid, email, fullName: fullName.trim(), schoolId: host, requestedAt: now, checkId,
      windowStartedAt: recent ? windowStart : now,
      attemptsInWindow: recovering && recent ? attempts : attempts + 1,
      status: 'checking', method: 'official-directory-v1', schoolAuthorization: false, evidence: [] });
  });
  const homepage = `https://${host}/`;
  const evidence = [];
  const hosts = [host, 'www.' + host];
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
  const home = await inspect(homepage);
  if (home && !matched) {
    await Promise.all(directoryLinks(home, homepage, hosts).map(inspect));
  }
  const result = { status: matched ? 'affiliation-verified-automatically' : 'not-verified',
    method: 'official-directory-v1', evidence, emailDomainMatches: true,
    checkedAt: now, expiresAt: matched ? now + 30 * 86400000 : now, schoolAuthorization: false };
  await db.runTransaction(async tx => {
    const latest = await tx.get(ref);
    if (latest.exists && latest.data().checkId === checkId) tx.set(ref, result, { merge: true });
  });
  return result;
}
