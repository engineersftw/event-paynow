## 1. Page

- [x] 1.1 In `src/web/page.ts` lift the shared base (head pieces, theme CSS and script, top bar) of `renderLandingPage` into helpers, keep the home page output the same apart from a new "Splitting a bill?" link shown only when a Split username is passed, and give `socialMeta` an optional `imageAlt`
- [x] 1.2 Add `renderSplitLandingPage(botUsername, origin)` with the sections in the design (what it does, how a split goes, get started, what it keeps), the Telegram button at the top and the end, a link home, the shared theme toggle and footer, social preview tags with its own image, and no third-party requests
- [x] 1.3 In `src/web/handler.ts` add `WebEnv.SPLIT_BOT_USERNAME` (optional), serve `/split` and `/split/` (404 when it is empty), and pass it to the home page

## 2. Config and assets

- [x] 2.1 Add `SPLIT_BOT_USERNAME = "Split_PayNow_Bot"` to `web/wrangler.toml` and exclude `/split-preview.jpg` and `/split-logo.png` in `web/public/_routes.json`
- [x] 2.2 Make `web/public/split-logo.png` (128x128, transparent) from the supplied logo and use it for the header image and tab icon of the Split page
- [x] 2.3 Add `scripts/generate-split-preview.mjs` (Playwright, 1280x720 JPEG, logo from a source-image argument), run it, check the file is under 200 KB, and commit `web/public/split-preview.jpg`

## 3. Tests and docs

- [x] 3.1 Add `test/workers/split-landing.test.ts`: the page for an anonymous visitor and with a trailing slash, the Telegram link from the configured username (and a hostile username stripped), the sections and the privacy wording, the preview tags with the page's own URL and image, 404 when unset, the home page link present and absent, no third-party URLs, and the Split logo used instead of the Event logo (header and tab icon, a PNG of at most 128x128 with transparency), the preview image file under 200 KB with the right dimensions
- [x] 3.2 Update README (web section: the `/split` page and the new Pages variable, capability count), `AGENTS.md` (item and capability count) and `docs/architecture.md`
- [x] 3.3 Check every claim on the page against the README, then run `npm run build`, `npm run check` and `npm test`; fix anything they report
