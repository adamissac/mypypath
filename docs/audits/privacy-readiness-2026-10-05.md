# PyPath privacy readiness audit — 5 October 2026

Status: operators confirmed as Adam Issac, Saicharan Chowdarapu, and Vihaan Krishna, individuals in Atlanta, Georgia. Final user decision: PyPath is restricted to ages 13 and older. Earlier under-13 plans below are superseded. Factual policy corrections drafted; not a legal compliance certification. Do not describe the site as COPPA-, FERPA-, GDPR-, or CCPA-compliant on the strength of this audit.

## Verified findings and corrections

- Terms contradicted classroom code sharing and incorrectly said account names were shown to other learners. Updated to describe aliases, lesson work, history, and teacher exports.
- Terms promised self-service deletion; account.html has no such control. Privacy now describes a manual request, ownership verification, and limits on recalling teacher downloads.
- Privacy directed sensitive requests to a public, outdated GitHub repository. Replaced with the existing Terms email, pending operator confirmation.
- Privacy promised 180-day removal, but event-sink.js invokes purgeExpired only in a student's browser; archived-class purge requires teacher action. Disclosed actual behavior; automated retention remains unresolved.
- Policy omitted font/CDN network requests and privileged infrastructure access. Added those distinctions.
- Terms purported to forbid reuse broadly despite the repository MIT license. Explicitly preserved applicable license grants.
- Updated document/acceptance version to 2026-10-05. Signup acknowledges the privacy notice separately from agreement to terms. This is not marketing consent or verified parental consent.
- Focused validation: consent and classroom-export suites, 51 passing tests.

## Decisions required before finalizing legal text

1. Identify the legal operator, jurisdiction, business/contact address where required, and monitored private inbox. Existing published address is adamissac08@gmail.com; ownership/monitoring not independently verified.
2. Confirm intended users and supported countries. Current age wording is internally inconsistent and must be settled alongside actual onboarding. Do not collect dates of birth speculatively. A minimum-age sentence or checkbox is not a complete child-privacy program.
3. If schools or under-13 users are supported, obtain qualified review of COPPA, FERPA, state student-privacy rules, school authorization, and data-processing agreements. School authority cannot simply be assumed from selecting 'teacher'.
4. Confirm vendor contracts, data locations, transfer safeguards, log/backup retention, subprocessors, and purposes/legal bases where applicable. Source code cannot verify account-level provider settings.

## Operational work still required

- Implement and monitor server-side retention independent of a returning student's browser. Define separate retention schedules for profiles, events, snapshots, assignments, archived classes, logs, backups, and requests. Disclosing indefinite storage does not itself make it lawful.
- Establish verified access/export/correction/deletion handling and jurisdiction-appropriate response deadlines. Test complete deletion across Authentication, user subcollections, class copies, teacher-owned classes, caches, and backups; do not delete only a parent Firestore document.
- Resolve existing Firestore/classroom CI failures and verify deployed rules against reviewed source before making security guarantees. No production rules were changed in this audit.
- Review staff/admin access, MFA, incident response and breach notification processes. Client rules do not constrain privileged Admin SDK access.
- Inventory browser storage and network traffic across guest, sign-in, lesson, classroom, and desktop flows. Determine which storage is necessary and whether optional tracking requires opt-in. No tracking SDK should be introduced under a generic terms checkbox.
- Consider self-hosting fonts and libraries to reduce third-party network disclosures; this audit only corrected the notice.
- Arrange accessible privacy/help routes and test account rights on mobile and with assistive technology.
- Notify existing users of material policy changes. A bumped version constant alone does not notify existing accounts or obtain any legally required renewed agreement.
- Verify content, image, font, and library licenses and attribution obligations. Blanket ownership language does not establish ownership.

## Authoritative starting points

- FTC COPPA FAQ: https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- FTC COPPA rule: https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa
- California Attorney General, CCPA applicability and rights: https://oag.ca.gov/privacy/ccpa
- ICO privacy notices and cookies: https://ico.org.uk/for-organisations/advice-for-small-organisations/privacy-notices-and-cookies/cookies-and-privacy-notices-in-detail/

Applicability depends on facts still awaiting operator confirmation. Obtain jurisdiction-specific legal review before treating the site as ready for school/child use.

## Confirmed operator details and child-access blocker

Adam Issac — adamissac08@gmail.com (main privacy contact); Saicharan Chowdarapu — sai.chowdarapu09@gmail.com; Vihaan Krishna — vvihaankrishna@gmail.com. Location: Atlanta, Georgia, United States; individuals, not a registered company. Confirm a suitable business mailing address and telephone contact for any required COPPA operator notice; do not publish a home address by inference.

Under-13 use is intended. Do not claim the service is not directed at children as a shortcut. The current signup has no age screening or verified parental/school authorization, and provider sign-in can collect data before any later check. The policy draft explicitly says the authorization route is unavailable; this notice does not technically enforce a restriction. The existing live flow remains unchanged. Resolve eligibility, pre-collection processing, authorization evidence, revocation, parent access/deletion, and backend enforcement together. Do not use a checkbox or a teacher's self-selected role as proof of authorization.

See FTC six-step compliance guidance: https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business and Department of Education provider guidance: https://studentprivacy.ed.gov/resources/responsibilities-third-party-service-providers-under-ferpa

## Final scope decision: ages 13 and older

The operator reversed the earlier under-13 request. Policies now restrict use and accounts to ages 13+, including school accounts. Signup asks for a neutral age range before enabling personal fields or Google/GitHub signup. An under-13 answer blocks the current page and clears fields. No date of birth or age range is transmitted or persisted by this control. The shared submission guard checks eligibility on email and OAuth routes. Four new regression tests cover disabled initial state, eligible/empty selection, under-13 blocking/clearing, and shared guard wiring; all 55 focused tests pass.

This is a client-side, self-reported restriction, not verified age assurance, backend enforcement, or a site-wide pre-collection gate. Reloading or bypassing the client can bypass the restriction. Existing accounts are not age-screened; guest network requests still occur. A 13+ label does not resolve actual knowledge of existing under-13 users or determine whether a service is legally child-directed. Operators must investigate known under-13 accounts and obtain legal review of audience classification. Earlier proposed parent/school authorization work is no longer in the requested product scope. Operational retention, deletion, vendor, access-control, and notice issues remain open.

## Latest decision: verified school join-code route

The user requested the school-authorized join-code route after the 13+ decision. The implemented pre-enrollment check is described in school-access-setup.md. It does not open under-13 account creation. Earlier 13+-only plans are superseded; ordinary self-service signup remains 13+ while the school route is unfinished. No server credentials, live authorization records, or production configuration were changed.
