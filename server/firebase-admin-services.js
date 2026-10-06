import { createPrivateKey } from 'node:crypto';

function configurationError(code) {
  return Object.assign(new Error('Teacher verification needs a server configuration update. Please try again later.'), { status: 503, publicCode: code });
}
export function parseServiceAccount(raw) {
  if (!raw) throw configurationError('verification/config-missing');
  let value;
  try {
    value = JSON.parse(raw.trim());
    // Some dashboard paste flows wrap the entire JSON in a JSON string.
    if (typeof value === 'string') value = JSON.parse(value);
  } catch { throw configurationError('verification/config-json'); }
  if (!value || typeof value !== 'object' || value.project_id !== 'mypypath') {
    throw configurationError('verification/config-project');
  }
  if (typeof value.client_email !== 'string' || !value.client_email.endsWith('.iam.gserviceaccount.com') || typeof value.private_key !== 'string') {
    throw configurationError('verification/config-fields');
  }
  value.private_key = value.private_key.replace(/\\n/g, '\n');
  try { createPrivateKey(value.private_key); }
  catch { throw configurationError('verification/config-key'); }
  return value;
}
export async function getTeacherServices() {
  const credentials = parseServiceAccount(process.env.PYPATH_FIREBASE_SERVICE_ACCOUNT);
  async function sdkPart(name, promise) {
    try { return await promise; }
    catch (error) {
      const reason = ['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ERR_REQUIRE_ESM', 'ERR_PACKAGE_PATH_NOT_EXPORTED'].includes(error.code)
        ? error.code.toLowerCase().replaceAll('_', '-') : error instanceof SyntaxError ? 'syntax' : 'load';
      throw configurationError(`verification/config-${name}-${reason}`);
    }
  }
  const { getApps, initializeApp, cert } = await sdkPart('app', import('firebase-admin/app'));
  const { getFirestore } = await sdkPart('firestore', import('firebase-admin/firestore'));
  const { getAuth } = await sdkPart('auth', import('firebase-admin/auth'));
  try {
    const app = getApps().find(a => a.name === 'teacher-verification')
      || initializeApp({ credential: cert(credentials), projectId: 'mypypath' }, 'teacher-verification');
    return { db: getFirestore(app), auth: getAuth(app) };
  } catch (error) {
    // Never echo SDK errors: these can contain credential material.
    const category = ['app/invalid-credential', 'app/invalid-app-options', 'app/invalid-project-id'].includes(error.code)
      ? 'credential' : ['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'].includes(error.code) ? 'dependency' : 'sdk';
    throw configurationError('verification/config-' + category);
  }
}
