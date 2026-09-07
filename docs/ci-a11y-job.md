# The accessibility CI job (needs a hand to install)

`npm run test:a11y` exists, works, and exits non-zero on a regression. What is
**not** wired up is the CI job that runs it, because the token this session was
pushing with lacks GitHub's `workflow` scope:

```
! [remote rejected] main -> main (refusing to allow an OAuth App to create or
  update workflow .github/workflows/ci.yml without `workflow` scope)
```

So the job below has to be added by someone whose credentials can write
workflows. Two ways:

```bash
gh auth refresh -s workflow     # then apply the patch below and push
```

or paste it into `.github/workflows/ci.yml` through the GitHub web editor.

## The job

Append this to `.github/workflows/ci.yml`, as a sibling of the existing `check`
and `js` jobs:

```yaml
  a11y:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      # The audit drives a real browser, because most of what WCAG asks about
      # is a property of rendered output rather than of markup.
      - run: npx playwright install --with-deps chromium
      - name: Accessibility audit
        run: npm run test:a11y
```

## Why it is a separate job

It downloads a browser. Putting it in the `js` job would slow the unit tests
down and would fail them on a day when Chromium's download is having problems,
which is a bad trade for a check that is not about JavaScript correctness.

## Why the budget is zero

`scripts/audit-a11y.mjs` exits 1 if it finds **any** violation. That is only
defensible because the site is genuinely at zero — see `9a06369`, which took it
from 92. A ratcheting budget ("no worse than 92") is the shape that lets a
number sit at 92 for a year: every commit is individually fine and nothing ever
improves.

Confirmed to fail, by reverting one button's background to the light fill token:

```
regressed exit code: 1
clean exit code:     0
```

Until the job is installed, the audit still runs locally with `npm run test:a11y`
and is worth running before any CSS or template change.
