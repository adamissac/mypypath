# Localization delivery status

The chooser is implemented. Whole-site translation is not complete. English is
the only ready language; the other 19 must remain `coming-soon` until their
content and runtime behavior are verified.

## Reproduce the content inventory

```sh
npm run audit:i18n -- --output /tmp/mypypath-i18n-coverage.json
npm run verify:i18n:release
```

The second command currently fails intentionally because required content is
unwired and untranslated. The first command exports source locations, text,
existing keys, deterministic content IDs, and ambiguous quiz choices. It reads
tracked public HTML and curriculum/assessment JSON without changing either.
It never reads student records, credentials, or outreach contacts.

Current inventory: 200 public HTML pages, 223 data JSON files, 36,894 text
occurrences, 18,667 distinct strings, 32,058 occurrences without localization
keys, and 4,694 quiz strings requiring prose-versus-code classification.
This is an inventory, not proof of complete extraction: inline scripts,
90 application JS files, and unknown data fields still need inspection.

## Remaining implementation

1. Wire static lesson prose (including mixed inline code) through generators.
   Preserve full sentence context while leaving executable examples untouched.
2. Add dynamic message keys to application modules and explicitly classify
   assessment options. Never translate answer IDs, Python syntax, or grading data.
3. Generate the 19 catalogs with resumable offline batches, retaining context
   and protected tokens. A provider is not currently configured. A translation
   service is an option for bulk generation, not a runtime dependency.
4. Review technical terminology, protect placeholders, and validate language
   quality. Machine output alone is not evidence of fluent review.
5. Replace the conservative dynamic-file review blocker with evidence tied to
   source revisions once dynamic extraction and browser checks are implemented.
6. Verify all route families, RTL, language changes, and fallback; only then
   enable each locale. Run the required browser regression suites before release.

`validate:i18n` now invokes the wider coverage gate when any additional locale
is marked ready. Merely copying English keys into a catalog cannot bypass the
remaining lesson and dynamic-content work.

## Access needed for deployment

The Vercel connector previously returned 403 for the `adams-projects-6cf40771`
team. Reconnect it using the Vercel account that owns the `mypypath` project,
granting access to that team and project. Signing in to a browser tab alone
does not update the connector authorization. Do not put access tokens or
translation API keys in this repository, browser JavaScript, or chat.
