# Tasks

## 1. Shared launch-data check

- [x] 1.1 Move `src/split-app/init-data.ts` to `src/access/init-data.ts`, update its importers (`src/split-app/api.ts`, `context.ts`, the tests), and move `test/node/split-app-init-data.test.ts` to match; verify with `npm run build` and the node tests

## 2. Sign-in and entry on the Pages site

- [x] 2.1 In `src/web/handler.ts` add `POST /api/miniapp-login` (same-origin JSON, `{ initData }` checked with `TELEGRAM_BOT_TOKEN`, answers 403 on failure, otherwise sets the `session` and `tg_name` cookies like `/api/login` through one shared helper and returns the signed `startParam` when it matches `REF`); verify with `npm run build`
- [x] 2.2 Add `GET /mini` (small page: post the launch data, then go to `/events/<startParam>`, or tell the user to use `/web_admin` when there is none; no event data) and keep it out of the static exclusions; verify with `npm run build`
- [x] 2.3 In `src/web/page.ts` load `telegram-web-app.js` on the event page, post `initData` before the first data request when it is not empty, call `ready()` and `expand()`, hide Sign out inside Telegram, and fall back to the Login Widget on a failure; verify with `npm run build`
- [x] 2.4 Workers tests (`test/workers/web-admin.test.ts` or a new file, using the signing helper from the Split tests): valid launch data sets both cookies and the event API then answers; forged, stale and missing data set nothing; a non-admin still gets 403 from the event API; `/mini` is served with no event data; the browser address and `/api/login` behave as before; node test that the event page script parses and includes the launch sign-in; verify the suites pass

## 3. /web_admin buttons

- [x] 3.1 Add the optional `EVENT_APP_NAME` var (`src/env.ts`, `wrangler.toml` comment) and pass it with `BOT_USERNAME` to `WebAdminCommandHandler`; with it set, each event row is Mini App link, 🌐 browser and 💳 Pay, without it the row is as today; verify with `npm run build`
- [x] 3.2 Tests: both keyboard shapes, the `startapp` value is the event reference, and the Pay button is unchanged; verify the suites pass

## 4. Docs and checks

- [x] 4.1 Update README (setup: create the BotFather app for the Event bot with Web App URL `<pages-site>/mini`, set `EVENT_APP_NAME`), AGENTS.md and `docs/architecture.md`; verify by search that the `/web_admin` descriptions mention both buttons
- [x] 4.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report

## 5. Rollout

- [x] 5.1 Create the BotFather app (Web App URL `<pages-site>/mini`) and set `EVENT_APP_NAME`; deploy; then on a phone and a desktop client run `/web_admin` in a group and a private chat, open an event through the Mini App button as an admin (signed in, no Login Widget), open it as a non-admin (not allowed), and open the browser button and a saved `/events/<ref>` link (Login Widget as before)

## 6. Session without cookies (found on Telegram Desktop)

- [x] 6.1 Return the session value from `POST /api/miniapp-login`, accept `Authorization: Bearer` beside the cookie in `src/web/handler.ts`, and in `src/web/page.ts` keep the value, send it on every same-origin request and load QR images through `fetch` when it is set; verify with `npm run build`
- [x] 6.2 Tests: the bearer value opens the event API with no cookie, a forged or expired one does not, the cookie still works, the page script parses and includes the token wrapper; verify `npm test`
- [ ] 6.3 After deploy, on Telegram Desktop open an event from the Mini App button as an admin: it loads signed in, and a payment QR and the scan dialog still work; a phone client still works

## Workflow follow-up

- Archive the change after 6.3 is confirmed on a real chat.
