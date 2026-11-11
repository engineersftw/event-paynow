## Why

The Split PayNow Bot has no public page of its own. The site's home page is entirely about the Event PayNow Bot, so someone who hears about the bill splitter has nowhere to see what it does, how a split works or what it keeps, and the bot's Telegram link has to be passed around bare. A page of its own can show the three ways to split, the receipt scan and group claiming, say plainly what is stored, and link straight to the bot.

## What Changes

- A public page at `/split` on the existing site, for anyone, no sign-in, no data read. It names the Split PayNow Bot with its own logo (the robot holding a bill above three people, supplied for this change) and has an **Add the bot on Telegram** button to `https://t.me/<Split bot username>`, reachable without scrolling on a phone.
- Content: what it does (an equal split with one QR; custom amounts with @mentions and QRs sent by direct message; a receipt photo read for the items and charges; in a group, everyone claims their own items and can pay at once), how to start (`/split`, `/split_custom`, `/split_receipt`, add it to a group or message it), how a split goes (payee first, then the bill, then a summary to confirm), and what it stores (nothing beyond the conversation; receipt photos are never kept; a mentioned person's username and a waiting QR are kept briefly, `/forget` deletes them).
- The same design, footer, light/dark toggle (saved choice shared with the other pages) and phone fit as the other pages; no video (there is no explainer for this bot).
- Social preview tags with the page's own 1280x720 preview image (built around the same logo), generated once and committed. The same logo is the page's icon in the browser tab.
- The logo is also what the bot's Telegram profile picture should be; that is set in BotFather (`/setuserpic`) by its owner and is not something the code or this change can do.
- The home page gets a short link to `/split` ("Splitting a bill? Try the Split PayNow Bot") and the split page links back home.
- The page is served only when the Split bot's username is configured as a Pages variable (`SPLIT_BOT_USERNAME`, set to `Split_PayNow_Bot` in `web/wrangler.toml`); without it `/split` answers 404.

Out of scope: a separate Pages project or domain (decided: same site), a video, screenshots of the bot, any change to the Worker or the bots, and replacing the Event PayNow Bot's own logo on the other pages.

## Capabilities

### New Capabilities

- `split-landing-page`: the public `/split` page.

### Modified Capabilities

- `landing-page`: the home page links to the Split page.
- `social-sharing`: the Split page carries preview tags with its own image.

## Impact

- `src/web/page.ts`: `renderSplitLandingPage`; `socialMeta` takes an image alt text; the home page gets the link.
- `src/web/handler.ts`: the `/split` route (and `/split/`), `WebEnv.SPLIT_BOT_USERNAME`.
- `web/wrangler.toml`: the `SPLIT_BOT_USERNAME` var. `web/public/_routes.json`: the new preview image and the new logo are excluded from the Function. New committed assets `web/public/split-logo.png` (128x128, transparent, made from the supplied 1254x1254 image) and `web/public/split-preview.jpg`, and the one-off script that makes the preview (`scripts/generate-split-preview.mjs`, run by hand with the pre-installed Playwright).
- Tests: `test/workers/split-landing.test.ts` (page, preview tags, 404 when unset, home link). Docs: README (web section and capability count), `AGENTS.md`, `docs/architecture.md`.
- The Pages deploy already runs for changes under `web/` and `src/web/`; no pipeline change.
