# Teacher verification v2

This replaces the domain-suffix approval in v1. Owning a .org, .school, .academy or .edu address is not sufficient. V1 badges are invalidated and rechecked automatically.

## Institution and staff checks

- US district domains under k12.[valid state].us retain their restricted namespace trust anchor. Email subdomains resolve to the district root.
- Other domains use the public ROR v2 API. Only active education records with an exact domain or bounded subdomain relationship count. Search ranking is not proof. Registry website links can establish a different website from the email domain.
- Teachers can provide a direct HTTPS staff page and an NCES school/district detail record. Only website links explicitly identified in the NCES record can establish the school website. Other user-supplied hosts are never fetched as staff evidence.
- The staff entry must still contain the exact account email and a teaching role together. Structured names tolerate honorifics, accents, surname-first order, and middle initials/names. Different first names or surnames do not fuzzy-match.
- No PyPath reviewer is needed. An incomplete match requests more information; a network/registry outage is a retryable state. Teachers have two corrected-details retries per day and can retry transient outages after five minutes, within the daily attempt allowance.
- Regular 13+ classroom access remains available while a check is inconclusive. The verified badge is the protected output. Under-13 enrollment remains disabled; affiliation is not school authorization.

## Runtime and safety

Firebase Admin 13.10.0 is pinned because the v14 jwks-rsa/jose dependency path fails with ERR_REQUIRE_ESM when the runtime disables require(ESM). A subprocess regression test exercises that runtime condition. The service-account parser supports normal JSON, double-encoded JSON, and escaped PEM newlines, rejects other projects, and exposes only fixed configuration error codes.

Directory requests pin validated public IPv4 DNS answers, validate every redirect, allow HTTPS only, and limit each page including DNS and redirects to eight seconds and 1MB. No arbitrary IP, private-network host or off-allowlist redirect is allowed. Checks store transaction reservations and check IDs so concurrent or stale workers cannot overwrite a newer check. Client writes to verification records remain denied by Firestore rules.

## Limits and validation

ROR is a research-organization registry, not a complete worldwide K12 directory. NCES covers US schools/districts, and its availability affects that fallback. Plain HTML staff listings are supported; PDF-only, login-only and JavaScript-only directories still need a publicly readable HTML listing. Unsupported layouts receive an inconclusive result, not a verified badge. This system cannot promise that every real teacher can be verified automatically.

No production user was created or assigned a verified result for testing. Use the focused Vitest suites and `node scripts/verify-teacher-verification.mjs` for disposable Auth/Firestore integration tests. A live unauthenticated or malformed-token response proves routing/SDK loading only, not successful production database access or staff verification.

References: https://ror.readme.io/docs/api-advanced-query and https://ror.readme.io/docs/ror-data-structure .
