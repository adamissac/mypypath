import { schoolAccess } from '../server/school-access.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ status: 'unavailable' });
  }
  // Never accept personal details on this pre-account endpoint.
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
      || Object.keys(req.body).some(key => key !== 'code')
      || typeof req.body.code !== 'string' || !/^[A-Z0-9]{6}$/.test(req.body.code)) {
    return res.status(400).json({ status: 'unavailable' });
  }
  // Explicit infrastructure activation: no implicit local ADC fallback.
  if (process.env.PYPATH_SCHOOL_CODE_CHECKS !== 'enabled'
      || !process.env.PYPATH_FIREBASE_SERVICE_ACCOUNT) {
    return res.status(503).json({ status: 'unavailable' });
  }
  try {
    const { getApps, initializeApp, cert } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    let app = getApps().find(a => a.name === 'school-access');
    if (!app) {
      const credentials = JSON.parse(process.env.PYPATH_FIREBASE_SERVICE_ACCOUNT);
      if (credentials.project_id !== 'mypypath') throw new Error('Wrong project');
      app = initializeApp({ credential: cert(credentials) }, 'school-access');
    }
    const approved = await schoolAccess(getFirestore(app), req.body.code);
    // This precheck must NEVER be treated as permission to create an account.
    // Provisioning, revocation and data-lifecycle controls are not yet ready.
    return res.status(200).json({ status: approved ? 'school-approved-enrollment-pending' : 'unavailable' });
  } catch {
    // Do not leak approval evidence, credentials, class data, or SDK errors.
    return res.status(503).json({ status: 'unavailable' });
  }
}
