# Tasks

## 1. Page

- [x] 1.1 Add `renderLandingPage(botUsername)` to `src/web/page.ts`: logo, title, intro, feature list, getting-started steps, Add-to-Telegram button (`https://t.me/<sanitised username>`) above the fold and again at the bottom, theme toggle (shared `THEME_EARLY`/`THEME_JS`), 320 px safe
- [x] 1.2 Route `GET /` to it in `src/web/handler.ts` (`text/html`, `no-store`); delete `web/public/index.html`

## 2. Tests

- [x] 2.1 Node test: the page contains the `t.me/<username>` link, the getting-started text and the theme toggle; a hostile username is sanitised
- [x] 2.2 Covered by the node test: `handleWeb` serves `GET /` with an env that has no database binding, so the route cannot touch D1

## 3. Docs and verification

- [x] 3.1 Update `README.md`, `AGENTS.md` and `docs/architecture.md` (the `/` route and the new page)
- [x] 3.2 Check the page in Playwright at 320 px and 390 px, light and dark; run `npm run check`, `npm run build` and the full test suite
