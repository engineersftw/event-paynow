# Tasks

## 1. Page

- [x] 1.1 In `renderLandingPage` (`src/web/page.ts`) add the `EXPLAINER_VIDEO_ID` constant (validated against the 11-character id format) and the video block under the first button: a 16:9 `<button>` card with the logo, "Watch the 75-second explainer" and a CSS play triangle, plus the always-visible "Watch on YouTube" link
- [x] 1.2 Add the small inline script that replaces the card with the `youtube-nocookie.com` iframe (autoplay, title, `allow`, `allowfullscreen`) on click, and the card's CSS using the existing colour tokens (light and dark)

## 2. Tests

- [x] 2.1 Node tests in `test/node/web-page.test.ts`: before the click there is no `<iframe` and no YouTube `src`, the button carries the id in `data-video`, the YouTube link is present, the script is valid and builds a `youtube-nocookie.com` embed, and an invalid id leaves the video block out

## 3. Docs and verification

- [x] 3.1 Update `README.md`, `docs/architecture.md` and `AGENTS.md` (the landing page now has the click-to-play video; change the id in one constant)
- [x] 3.2 Check with Playwright at 320 px and 390 px, light and dark, before and after the click (no horizontal overflow, 16:9 card, iframe `src` correct); run `npm run check`, `npm run build` and the full test suite
