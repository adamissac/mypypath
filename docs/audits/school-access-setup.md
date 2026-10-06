# School access: current implementation and activation requirements

The signup age step now exposes a teacher-code check for under-13 learners before allowing personal fields. The new POST /api/school-access accepts only a six-character code. It never creates an account or unlocks regular signup, even when school authorization is found. This is a pre-enrollment check, not finished under-13 enrollment.

## Server setup

The endpoint is disabled unless PYPATH_SCHOOL_CODE_CHECKS is exactly `enabled` and PYPATH_FIREBASE_SERVICE_ACCOUNT holds a server-only Firebase service account JSON for project mypypath. Use a dedicated identity with only the Firestore read permissions needed here. Keep credentials in encrypted server configuration, never in client files, the repository, or chat. Configure edge rate limiting before enabling public code checks; six-character codes can be guessed. No credentials or environment settings were created by this change.

## Approval records

A trusted operator must verify the school and authorizing representative, deliver the applicable notice, confirm school-only educational use, and retain evidence privately before writing `schoolAuthorizations/{classId}`. The record requires:

- status: `approved` (use `revoked` to withdraw)
- purpose: `school-education-only`
- teacherUid: the class code owner's Firebase UID
- reviewedBy: operator identifier
- evidenceRef: reference to privately held authorization evidence, not the evidence itself
- reviewedAt and expiresAt: finite epoch-millisecond values

The existing Firestore rules have no allow rule for this collection, so clients, including teachers, cannot read or write it. The server reads it with privileged credentials. No production approval has been fabricated or created. Approval is class-specific and is rejected when expired, revoked, archived, missing, or mismatched with the current code/teacher.

The public response contains no class name, teacher identity, evidence, or pupil data. A recognized approval returns `school-approved-enrollment-pending`; all other cases return `unavailable`. The page explains that enrollment remains closed.

## Work required before any under-13 account can be created

- Complete server-side account provisioning, binding the authorization and child account to the correct school/class. Recheck authorization on submission, not only at code lookup.
- Prevent child accounts from changing themselves into teachers, transferring to unapproved classes, or losing applicable restrictions after leaving a class. Define revocation and school closure behavior.
- Build and verify access, export, deletion, and retention controls and operational response procedures. Current browser-triggered deletion is not a reliable retention job.
- Review the whole pre-account page's SDK, font/CDN, logging, and storage behavior. Locked fields alone do not mean no personal information is processed.
- Obtain legal review of school authorization, operator notice/contact requirements, intended audience, and applicable student-privacy obligations. A teacher code does not shift PyPath's responsibilities to a teacher.
- Verify deployed Firestore rules and test the finished flow in staging before enabling enrollment.

Validation: 73 focused tests pass across school-access, signup-age, consent, and classroom-export. Tests cover ordinary codes, expiry, revocation, teacher mismatch, archive/code rotation, missing configuration, personal-field rejection, and keeping under-13 signup locked after either lookup outcome. No real school enrollment has been tested or enabled.
