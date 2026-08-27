/* PyPath — verifying a Firebase ID token, server-side.
 *
 * The whole reason api/grade.js exists is that an Anthropic API key cannot be
 * trusted to a browser. That argument only holds if the endpoint holding the
 * key checks who is calling it. Without this file, api/grade.js is an open
 * proxy to a paid API, and the bill arrives regardless of who found the URL.
 *
 * Deliberately not firebase-admin. That package exists to hold a service
 * account and act with it; this function has no service account and wants
 * none, because a function that cannot write to Firestore cannot be turned
 * into one that rewrites a student's record. Verifying a signature against
 * Google's published public keys needs no credentials at all, and Node's own
 * webcrypto does it in about forty lines.
 */
const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'mypypath';
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;

/* Google rotates these keys and says how long to keep them in the response's
   own Cache-Control. Held in module scope, so a warm instance verifies without
   a network round trip and a cold one pays for it once. */
let keyCache = { keys: null, expiresAt: 0 };

async function signingKeys() {
  if (keyCache.keys && Date.now() < keyCache.expiresAt) return keyCache.keys;

  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error('could not fetch signing keys');
  const body = await res.json();

  const control = res.headers.get('cache-control') || '';
  const maxAge = /max-age=(\d+)/.exec(control);
  // An hour if Google did not say, which is far shorter than the real rotation
  // period and therefore safe in the direction that matters.
  const ttl = maxAge ? Number(maxAge[1]) * 1000 : 60 * 60 * 1000;

  const keys = {};
  for (const jwk of body.keys || []) {
    keys[jwk.kid] = jwk;
  }
  keyCache = { keys, expiresAt: Date.now() + ttl };
  return keys;
}

function fromBase64Url(text) {
  return Buffer.from(String(text).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/* Returns the uid, or throws. Never returns a partial answer: a token that
   fails any check fails all of them, and the caller has one thing to test. */
export async function verifyIdToken(authorization) {
  const raw = /^Bearer (.+)$/.exec(String(authorization || ''));
  if (!raw) throw new Error('no bearer token');

  const parts = raw[1].split('.');
  if (parts.length !== 3) throw new Error('malformed token');

  const header = JSON.parse(fromBase64Url(parts[0]).toString('utf8'));
  const claims = JSON.parse(fromBase64Url(parts[1]).toString('utf8'));

  const jwk = (await signingKeys())[header.kid];
  if (!jwk || header.alg !== 'RS256') throw new Error('unknown signing key');

  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    fromBase64Url(parts[2]),
    Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8')
  );
  if (!ok) throw new Error('bad signature');

  // A valid signature on a token issued for a different project is still a
  // valid signature. Google signs every project's tokens with the same keys,
  // so the audience check is what scopes this endpoint to this app.
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== PROJECT_ID) throw new Error('wrong audience');
  if (claims.iss !== ISSUER) throw new Error('wrong issuer');
  if (!claims.sub) throw new Error('no subject');
  if (Number(claims.exp) <= now) throw new Error('expired');
  if (Number(claims.iat) > now + 300) throw new Error('issued in the future');

  return claims.sub;
}

export { PROJECT_ID };
