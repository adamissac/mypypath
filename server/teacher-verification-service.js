// Runtime-independent HTTP boundary, exercised with fake credentials/database
// in tests. Only trusted server code can write verification records.
export function verificationView(record, user, profile, now = Date.now()) {
  const eligible = profile?.role === 'teacher' && user.email_verified === true;
  const identityMatches = record?.email === user.email && record?.uid === user.uid;
  const current = identityMatches && record?.status === 'affiliation-verified-automatically'
    && record?.method === 'official-directory-v1' && Number.isFinite(record.expiresAt) && record.expiresAt > now;
  const verified = !!(eligible && current);
  let status = record?.status || 'not-checked';
  if (!eligible) status = 'account-ineligible';
  else if (record && !identityMatches) status = 'identity-changed';
  else if (record?.status === 'affiliation-verified-automatically' && !current) status = 'expired';
  return { verified, status, request: identityMatches ? { ...record, status } : null };
}
export function createTeacherHandler({ getServices, checkTeacher, now = () => Date.now() }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    const bearer = (req.headers?.authorization || '').match(/^Bearer (\S+)$/);
    if (!bearer) return res.status(401).json({ error: 'Sign in to continue.' });
    try {
      const { auth, db } = await getServices();
      let user;
      try { user = await auth.verifyIdToken(bearer[1], true); }
      catch { return res.status(401).json({ error: 'Sign in again to continue.' }); }
      const profileSnap = await db.doc(`users/${user.uid}`).get();
      const profile = profileSnap.exists ? profileSnap.data() : null;
      const ref = db.doc(`teacherVerificationRequests/${user.uid}`);
      const snap = await ref.get();
      const view = verificationView(snap.exists ? snap.data() : null, user, profile, now());
      if (req.method === 'GET') return res.status(200).json(view);
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 4096
          || Object.keys(body).some(key => !['action', 'fullName'].includes(key))
          || !['check','ensure'].includes(body.action)) {
        return res.status(400).json({ error: 'Invalid verification request.' });
      }
      if (profile?.role !== 'teacher' || user.email_verified !== true || typeof user.email !== 'string') {
        return res.status(403).json({ error: 'Use a teacher account with a verified school sign-in email.' });
      }
      // Passive page loads reuse a result instead of scraping again. Incomplete
      // jobs recover after 2 minutes; failed checks retry after 24 hours.
      const record = view.request;
      const age = record ? now() - record.requestedAt : Infinity;
      const retryDelay = record?.status === 'checking' ? 120000 : 86400000;
      if (body.action === 'ensure' && (view.verified || (age >= 0 && age < retryDelay))) {
        return res.status(200).json(view);
      }
      const fullName = body.fullName || record?.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.displayName;
      try {
        await checkTeacher({ db, uid: user.uid, email: user.email, fullName, now: now() });
      } catch (error) {
        if (error.status === 429 && body.action === 'ensure') {
          const latest = await ref.get();
          return res.status(200).json(verificationView(latest.exists ? latest.data() : null, user, profile, now()));
        }
        throw error;
      }
      const updated = await ref.get();
      return res.status(200).json(verificationView(updated.exists ? updated.data() : null, user, profile, now()));
    } catch (error) {
      const expected = [400,403,409,422,429,503].includes(error.status);
      return res.status(expected ? error.status : 503).json({ error: expected ? error.message : 'Automatic verification is temporarily unavailable.',
        ...(error.publicCode?.startsWith('verification/config-') ? { code: error.publicCode } : {}) });
    }
  };
}
