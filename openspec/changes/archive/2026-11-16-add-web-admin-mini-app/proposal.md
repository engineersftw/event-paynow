# Proposal

## Why

Opening the event page from `/web_admin` leaves Telegram for the browser, where the admin must sign in with the Login Widget again (a phone number and a code on some devices). As a Telegram Mini App the same page opens inside Telegram and signs the admin in from the launch data Telegram already signs, as the Split bot's Mini App does.

## What Changes

- The event page works as a Telegram Mini App of the Event bot: inside Telegram it signs the admin in from the signed launch data (`initData`, checked with the Event bot's token) and sets the same session cookie the Login Widget sets. Everything after that (the chat-admin check, the API, the page) is unchanged.
- A Mini App entry address on the Pages site opens the event named by the signed `startapp` value, so one BotFather app serves every event.
- `/web_admin` gives each event a button that opens the Mini App when it is configured, and a second button with the browser address. The Pay button is unchanged. When the Mini App is not configured, `/web_admin` is exactly as it is today.
- The browser address `/events/<ref>` and its Login Widget sign-in keep working for anyone outside Telegram.
- The launch-data check moves from `src/split-app/` to `src/access/` so the Worker and the Pages Function share one copy.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `web-admin`: `/web_admin` offers a Mini App button and a browser button per event, the event page signs in from Mini App launch data inside Telegram, and the browser address and Login Widget sign-in stay available.

## Impact

- Code: `src/access/init-data.ts` (moved from `src/split-app/`), `src/web/handler.ts` (`POST /api/miniapp-login`, `GET /mini`), `src/web/page.ts` (Telegram script and launch sign-in), `src/commands/web-admin-handler.ts`, `src/env.ts`, `src/bot.ts`, `wrangler.toml`.
- Config: a Worker var `EVENT_APP_NAME` (the BotFather app short name); the BotFather app's Web App URL is the Pages site's `/mini`.
- No database change and no new secret: the Pages site already holds the Event bot token and `SESSION_SECRET`.
- Tests: node tests for the moved check and the page, Workers tests for the login and entry routes and the `/web_admin` buttons.
