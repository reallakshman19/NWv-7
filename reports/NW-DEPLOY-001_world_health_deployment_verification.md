# NW-DEPLOY-001 — World health deployment verification

## Trigger

PR #417 repaired the Main-to-Sections health projection, but source-level certification alone cannot prove that the published GitHub Pages bundle renders the corrected World badge and popover.

## Verification contract

After `actions/deploy-pages` returns the real deployment URL, the workflow launches a fresh mobile-size Chromium context and checks the deployed Main page.

The gate requires:

- `#world-news` to render;
- the World `.section-health-badge` to have `data-status` equal to `ok`, `warning`, or `critical`;
- the badge not to resolve to `unknown`;
- the Section Health Diagnostics dialog to open;
- the dialog not to report `unknown — diagnostics unavailable`;
- `sectionId` to equal `world`;
- `storyCount` to be positive;
- `sourceGroupCount` to be positive;
- `topSources` to contain recorded source evidence.

A JSON report and full-page screenshot are uploaded for every run, including failures.

## Scope

This work adds deployment verification only. It does not change ranking, source policy, generated news data, section-health computation, UI styling, package versions, or runtime feature behavior.
