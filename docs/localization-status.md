# Localization delivery status

English plus 19 selectable languages are implemented. The additional languages
are explicitly labeled **partial, automatic translations**. This is not a
claim of complete lesson coverage or fluent-human review.

The owner chose to stay within Azure Translator's free allowance. The October
batch reserved 1,827,705 characters, including interface strings and the test
lesson, below the tool's conservative 1.9M ceiling and Azure F0's 2M/month cap.
No paid tier was enabled. The current source corpus would take roughly 19M
characters to translate into all 19 languages; further lesson coverage requires
future quota or a separately authorized budget.

## Shipped scope

- Searchable first-visit chooser, native names, country aliases, persisted
  selection, RTL direction, and change-language control on every page.
- Shared interface catalogs in all 19 languages, with corrections for ambiguous
  interface phrases such as Settings and Close language chooser.
- Page catalogs for 200 routes per language. For each target, 9,815 of 21,332
  static text/attribute occurrences have translations (many share a phrase).
  Twenty-five pages have all inventoried static units translated. Runtime
  messages and user content are separate; these figures do not imply those
  pages are completely translated in every interactive state.
- Main static pages and selected introductory lessons receive priority.
  Untranslated advanced lessons and dynamic messages retain English. A notice
  explains the fallback, and source-language tags accompany remaining content.
- Visitors never send text to Azure. The API is used only offline on public
  repository content; static JSON catalogs are deployed with the website.
- Python code, inline interactive nodes, field values, URLs, and runtime-updated
  text are preserved. Switching back to English restores the original prose.

## Reproduce and extend

```sh
npm run extract:i18n
npm run translate:i18n -- --shell-only               # estimate only
npm run translate:i18n -- --priority-characters=95000 # estimate only
npm run validate:i18n
npm run test:i18n:browser
npm run test:i18n:content
```

Adding `--run` makes Azure requests. The local configuration is outside the
repository at `~/.config/mypypath/translator.json`, with owner-only permissions.
Never copy it into site assets or commit it. The same directory contains a
monthly usage reservation ledger and an exclusive lock. The script saves
resumable progress under ignored `.audit/i18n/`, honors rate-limit backoff,
and stops before exceeding the configured character ceiling. Do not increase
the ceiling or change the service tier without budget authorization.

`scripts/bake_layout.py` refreshes source manifests after generating pages.
Run extraction, then resume translations to cover changed English sources.
`ui-overrides.json` preserves reviewed-by-agent interface corrections on rerun;
those corrections are not certified native-speaker review.

`audit:i18n` remains a broad source inventory. `verify:i18n:release` is the
stricter whole-site completion gate and still fails, intentionally, because
this free-budget release is partial. `validate:i18n` validates the actual
partial-release contract, including all route catalog files and inline tokens.

## Remaining work

Translate remaining lesson prose and assessment content using future allowance;
add explicit dynamic-message localization; review technical terminology with
fluent speakers. Keep code and grading identifiers separate when translating
quiz options. Never relabel partial locales as fully ready just to bypass the
whole-site completeness gate.
