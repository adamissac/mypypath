# Whole-site localization design

**Status:** Design approved in chat; awaiting written-spec review  
**Date:** 2026-10-08

## Goal

Let visitors choose a language on their first visit and use PyPath in that language across the entire site, including course pages, lessons, exercises, quizzes, account flows, and shared navigation. Keep the experience searchable, usable with a keyboard and screen reader, and easy to change later. Preserve code examples, commands, and programming identifiers exactly.

## Scope and supported languages

The first release supports 20 languages total, including English:

1. English (`en`)
2. Spanish (`es`)
3. French (`fr`)
4. Portuguese (`pt`)
5. Hindi (`hi`)
6. Bengali (`bn`)
7. Filipino/Tagalog (`fil`)
8. Swahili (`sw`)
9. Nepali (`ne`)
10. Urdu (`ur`)
11. Arabic (`ar`)
12. Dari (`fa-AF`)
13. Pashto (`ps`)
14. Indonesian (`id`)
15. Malay (`ms`)
16. Vietnamese (`vi`)
17. Khmer (`km`)
18. Burmese (`my`)
19. Russian (`ru`)
20. Simplified Chinese (`zh-CN`)

The teacher outreach list contains 91 country/region labels and includes composite and regional entries. Language choices will use localized endonyms and searchable country aliases to help users find relevant choices. The 20-language cap cannot provide every local language spoken in every listed country; the list prioritizes broad coverage and the countries most represented in the outreach data. Language choice will not be inferred from a school email domain.

## Visitor experience

- On a first visit, show a clear language welcome dialog before asking for an account. Suggest the browser's best supported language when possible; keep English as the fallback.
- Provide a search field that matches language names in their own script, common English names, and country/region aliases. The list is keyboard accessible and announces results and selection to assistive technology.
- Choosing a language immediately applies it and stores the preference on the device. A persistent language control on every page allows changing it at any time. Do not require sign-in or send the preference to a third party.
- Set the document's `lang` and `dir` attributes correctly. Arabic, Dari, Pashto, and Urdu use right-to-left page direction while code and code examples remain left-to-right.
- Translate user-facing static and dynamic text, including validation messages, empty states, menus, lesson content, exercise instructions, quizzes, and generated course pages. Keep user-entered content, Python syntax, code identifiers, URLs, and technical tokens unchanged.

## Translation architecture

PyPath is a static HTML/CSS/JavaScript site with shared layout generation and course content generators, so localization must work without a server-side rendering service or runtime translation API.

- Use versioned, build-time locale catalogs and stable message identifiers for interface text and dynamic messages.
- Integrate lesson and course translations with the existing content sources and generators so regenerated pages retain localization. Keep translated prose separate from executable code and question/answer logic.
- Resolve the selected locale from the saved preference, then browser preferences, then English. Load the matching catalog and apply translated content; if a string is not yet translated, show its English source without breaking the page.
- Keep all translations in the repository and deploy them with the site. Do not send page contents or user information to an external translation service at runtime.
- Track translation completeness and review state by locale and source content. A language is selectable only when its site-wide required text has a reviewed translation; while preparation is incomplete, it may appear as coming soon rather than silently presenting a mostly English site.

## Translation quality

The English source is authoritative. Each locale must be translated with consistent educational terminology, reviewed for natural language and meaning, and checked in rendered pages by a fluent reviewer before being marked complete. Automated checks can detect missing keys, malformed markup, untranslated source text, and broken exercises, but cannot certify fluency. Do not claim perfect or legally certified translation quality. Keep Python code and identifiers unchanged, and flag terminology decisions in a small per-locale glossary.

## Accessibility, directionality, and formatting

- Use native language names and correct locale tags. Set right-to-left direction for Arabic, Dari, Pashto, and Urdu, with isolated left-to-right code blocks and bidirectional-safe inline technical terms.
- Use locale-aware `Intl` formatting for dates and numbers where the interface currently formats them; do not alter numeric values or course grading semantics.
- Preserve focus visibility, dialog focus management, escape handling, mobile layout, and reduced-motion behavior. Search, selection, and dismissal must work without a pointer.

## Failure handling

- Missing locale data or a load error falls back to English and leaves the selector available.
- Unsupported browser locale falls back to English without repeatedly prompting.
- A saved valid preference takes precedence over browser settings. A visitor can reopen the picker from any page.
- Translation lookup must never modify course state, user data, grading, routes, or authentication behavior.

## Verification and release

- Enforce that every required message key exists in English and all selectable locales; only explicitly optional content can fall back.
- Verify all 20 locale catalogs parse, locale tags and text direction are correct, and code blocks and executable examples are byte-identical to English.
- Exercise first-visit choice, browser suggestion, saved preference, search aliases, changing languages, missing-catalog fallback, and RTL layout in a real browser.
- Run the repository's relevant test suites plus the existing accessibility, keyboard, mobile, motion, and performance checks after UI changes. Check representative pages from every route family, including generated lessons, interactive exercises, account pages, and teacher flows.
- Commit and push the finished implementation to `main`; confirm the Vercel production deployment and check the public site after deployment. Report any translations that still require fluent-human review rather than marking them complete.

## Explicit limitations

Twenty language options cannot represent every local language associated with the outreach list's 91 country and region labels. English fallback is for incomplete or optional content only and must not be presented as a completed translation. Machine-generated or automatically checked text is not described as human-reviewed unless a fluent person actually reviews it.
