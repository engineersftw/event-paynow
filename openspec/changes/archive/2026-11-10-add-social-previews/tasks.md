# Tasks

## 1. Image

- [x] 1.1 Convert `out/explainer/poster.png` to `web/public/explainer-poster.jpg` (1280x720, about 100 KB, under 200 KB) with ffmpeg, add `/explainer-poster.jpg` to the exclude list in `web/public/_routes.json`, and put the conversion command in the README

## 2. Tags and video card

- [x] 2.1 `socialMeta()` helper in `src/web/page.ts` (all Open Graph, Twitter, description and canonical tags, attribute-escaped) and use it in `renderLandingPage`, with the origin passed in from `handleWeb`
- [x] 2.2 Landing video card: show `/explainer-poster.jpg` with a round CSS Play button over it (no logo or text), keeping the click-to-play behaviour, the plain YouTube link, keyboard use and the 320 px fit; no request to YouTube before a click
- [x] 2.3 Payment pages: in the `/pay/<ref>` route look the event up (`getEventByRef`, in a try/catch), pass the origin and the event name to `renderPayerPage`, use "Pay for <name>" (escaped, shortened to 60 characters) for an open event and the generic wording for unknown, closed or failed lookups, and use it in the initial `<title>`

## 3. Tests

- [x] 3.1 Node tests: `socialMeta` escaping and structure; the landing page has every tag with absolute URLs built from the given origin and no JavaScript needed; the video card uses the poster and still has no YouTube host in any resource tag; the admin page has no `og:` or `twitter:` tags
- [x] 3.2 Workers tests for `/pay/<ref>`: open event shows its name, a hostile name is escaped, unknown and closed events and a failing lookup fall back to generic wording and still return 200; and a check that the JPEG is 1280x720 and under 200 KB

## 4. Docs and verification

- [x] 4.1 Update `README.md` (what the previews contain, the JPEG conversion command, how to refresh platform caches and test with the Facebook, LinkedIn and X validators), `AGENTS.md` and `docs/architecture.md`
- [x] 4.2 Check with Playwright at 320 px and 390 px, light and dark: the new video card (poster, Play button, no overflow, zero YouTube requests before a click); run `npm run check`, `npm run build`, the full test suite and `openspec validate --specs`
