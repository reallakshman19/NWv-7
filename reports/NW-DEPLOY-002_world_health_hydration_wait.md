# NW-DEPLOY-002 — World health hydration wait

## Production finding

The World health verification run for the NW-MAIN-007 deployment captured the Main page while it still displayed `Main is loading...`. All section bodies showed `No news available`, so their badges were correctly still at the initial `Unknown` state.

## Root cause

The smoke test waited for the `#world-news` section shell, which renders before asynchronous NewsContext hydration. It then evaluated the badge before World stories and their runtime health summary were present.

## Correction

The verification now waits up to 90 seconds for `#world-news .news-count` to contain a positive number. Only then does it settle briefly and evaluate the badge and diagnostics popover.

The JSON evidence now also records:

- final browser URL;
- hydration duration;
- World count text;
- browser console errors;
- uncaught page errors.

All existing acceptance checks remain: a concrete badge state, non-unknown popover, `sectionId=world`, positive story/source-group counts, and recorded top-source evidence.
