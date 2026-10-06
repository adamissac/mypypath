// Read-only eligibility check. An approval is evidence of an operator review,
// not something a teacher can grant by creating a class or checking a box.
export async function schoolAccess(db, code, now = Date.now()) {
  if (typeof code !== 'string' || !/^[A-Z0-9]{6}$/.test(code)) return false;
  const link = await db.doc(`joinCodes/${code}`).get();
  const route = link.exists ? link.data() : null;
  if (!route || route.active === false || typeof route.classId !== 'string'
      || !/^[A-Za-z0-9_-]{1,128}$/.test(route.classId)) return false;
  const [klass, approval] = await Promise.all([
    db.doc(`classes/${route.classId}`).get(),
    db.doc(`schoolAuthorizations/${route.classId}`).get(),
  ]);
  const k = klass.exists ? klass.data() : null;
  const a = approval.exists ? approval.data() : null;
  return !!(k && a && k.archived === false && k.joinCode === code
    && Array.isArray(k.teacherUids) && k.teacherUids.includes(route.teacherUid)
    && a.status === 'approved' && a.purpose === 'school-education-only'
    && a.teacherUid === route.teacherUid
    && typeof a.reviewedBy === 'string' && a.reviewedBy.trim()
    && typeof a.evidenceRef === 'string' && a.evidenceRef.trim()
    && Number.isFinite(a.reviewedAt) && a.reviewedAt > 0 && a.reviewedAt <= now
    && Number.isFinite(a.expiresAt) && a.expiresAt > now);
}
