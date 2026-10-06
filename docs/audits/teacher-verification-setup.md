# Automatic teacher affiliation checks

> Historical implementation notes. The current behavior, deployment verification and limits are documented in [teacher-verification-v2.md](teacher-verification-v2.md).

This replaces the earlier operator review queue. The active API runs automaticTeacherCheck and exposes no approval/review action. It never asks PyPath to approve an individual teacher.

Checks start automatically for eligible teachers on Account, Classroom and /teacher-verification.html. Teachers use a confirmed institutional email and their school directory name; the details page allows name corrections. The backend authenticates their Firebase token (including revocation checking) and confirms their account role. It derives the official website from a supported school email domain, loads the homepage, discovers up to three same-origin staff/faculty/directory links, and searches those pages for the exact email, supplied name and a teaching role in the same individual staff entry. A match records affiliation-verified-automatically; otherwise the result is not-verified. There is no manual approval fallback. Results expire after 30 days and each account can request a check once per 24 hours, with one corrected-name retry after a failed match. Interrupted checks can recover after two minutes.

## Current coverage and limits

The trust anchor accepts institutional .k12.[state].us, .edu, .org, .school, and .academy domains; consumer domains remain blocked. The email domain is still only a starting point: the exact address, supplied name, and teaching role must appear together in one public staff entry on the HTTPS site at that domain. Schools using a separate email and web domain, cross-domain redirects, PDFs, inaccessible pages, and JavaScript-only directories remain unverified. A website can be stale; automated matching is evidence under this standard, not a guarantee of current employment or delegated authority.

No teacher name or email is sent to a search engine. The backend fetches official public pages, stores only source URLs and match signals, and never treats page text as executable instructions. Private/reserved addresses and arbitrary origins are blocked; at most two HTTPS redirects between the district root and its www hostname are allowed per page; DNS results are pinned for the TLS request. Limit: four pages, 256KB per page, ten seconds per HTTP request and five seconds for DNS resolution. The function duration limit is 60 seconds. Configure additional edge limits before rollout.

## Activation

Server credentials remain unconfigured. Deploy the Node API routes on Vercel and configure encrypted server-only PYPATH_FIREBASE_SERVICE_ACCOUNT for mypypath with the narrowest needed Firebase Authentication/Firestore permissions. Never put credentials in the repo or chat. The verification result collection must remain inaccessible to direct client writes. No source registration by PyPath is required for supported k12 domains. No real account was verified in this task; live testing still requires an authorized test account.

## Under-13 enrollment remains separate and incomplete

The automatic affiliation result deliberately records schoolAuthorization:false. It does not create a schoolAuthorizations record or unlock child accounts. A scraped staff listing cannot demonstrate that the school authorized collection/use of pupil information. That authorization could be collected electronically without a PyPath reviewer, but a truthful notice, authorized school representative, recorded acceptance, child account provisioning, access/deletion/retention and revocation still need to be implemented and checked. The current school-code endpoint remains a pre-enrollment check and cannot create an under-13 account. Under-13 enrollment is deferred at the owner’s request.

The historical audit files describe earlier decisions and are superseded by this document for teacher verification. Policy text reflects the currently implemented limits. Run the focused Vitest suites and `node scripts/verify-teacher-verification.mjs`. The integration command uses disposable local Auth/Firestore emulators and fixture school pages; it does not contact schools or verify a production account.

Production activation remains blocked: Vercel environment settings returned HTTP 403 even after reconnection. The server credential has not been configured by this task.

## Final local verification (2026-10-06)

- 182 focused unit/UI tests passed across 11 suites, including the three suites that failed in the earlier full run (metadata, breakpoints, token assertion).
- Eight integration tests passed using real disposable Firebase Auth and Firestore emulators: successful verification, result reuse, denied client forgery, authentication/role checks, input tampering, concurrent checks, missing evidence, expiry and role changes.
- The verified page state was rendered with fixture authentication/API responses at 320px and 1440px: zero main-content axe violations and no horizontal overflow. This was not a production account verification.
- Earlier whole-site checks: accessibility, keyboard and reduced motion passed. Performance exceeded the existing homepage own-byte budget (1522KB vs 1500KB); mobile reported one homepage menu-opening failure at 320px among 168 combinations. These remain whole-site limitations outside this verification feature.
