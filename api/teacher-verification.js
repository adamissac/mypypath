import { automaticTeacherCheck } from '../server/automatic-teacher-verification.js';
import { createTeacherHandler } from '../server/teacher-verification-service.js';

async function getServices() {
  if (!process.env.PYPATH_FIREBASE_SERVICE_ACCOUNT) {
    throw Object.assign(new Error('Automatic teacher verification is not configured yet.'), { status: 503 });
  }
  const { getApps, initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  let app = getApps().find(a => a.name === 'teacher-verification');
  if (!app) {
    const credentials = JSON.parse(process.env.PYPATH_FIREBASE_SERVICE_ACCOUNT);
    if (credentials.project_id !== 'mypypath') throw new Error('Configuration error');
    app = initializeApp({ credential: cert(credentials) }, 'teacher-verification');
  }
  return { db: getFirestore(app), auth: getAuth(app) };
}
export default createTeacherHandler({ getServices, checkTeacher: automaticTeacherCheck });
