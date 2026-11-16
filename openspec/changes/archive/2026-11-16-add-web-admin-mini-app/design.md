# Design

## Context

The event page is one Pages Function (`handleWeb`). Its sign-in is the Login Widget, which redirects to `/api/login`, verified with the Event bot token; that sets the signed `session` cookie every API route reads (`verifySession`), after which `eventAccess` does the live chat-admin check. `/web_admin` sends url buttons. The Split bot already has a Mini App with a launch-data check (`verifyInitData`, in `src/split-app/`), served from the Worker; web_app buttons work only in private chats, so it opens by direct link `https://t.me/<bot>/<app>?startapp=<value>`. See proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- Open the existing event page inside Telegram with no second sign-in.
- Reuse the page, the API, the session and the admin check unchanged.
- Keep `/events/<ref>` and the Login Widget working.

**Non-Goals:**
- A separate Mini App interface, new API routes for data, or Telegram theme or back-button integration.
- Changing the payer page `/pay/<ref>`; its Pay button stays a normal link.
- A list of events inside the Mini App.

## Decisions

1. **Mini App sign-in sets the existing session cookie.** `POST /api/miniapp-login` takes `{ initData }`, verifies it with the Event bot token and answers with the same `session` and `tg_name` cookies as `/api/login`. Every other route is untouched, so there is one place that decides access. Alternative: send `initData` with each request and verify per call, which needs every route changed and a different cache story. Rejected.
2. **The event page signs in by itself when it runs inside Telegram.** The page loads `telegram-web-app.js` and, when `Telegram.WebApp.initData` is not empty, posts it before its first data request, then calls `ready()` and `expand()` and hides the Sign out button (leaving the Mini App is the way out). Outside Telegram `initData` is empty and nothing changes. If the cookie is refused, the existing 401 path shows the Login Widget.
3. **One entry address, `/mini`.** The BotFather app's Web App URL is the Pages site's `/mini`. It is a tiny page that reads the verified `start_param` (via the same login post) and moves to `/events/<ref>`. The reference comes only from the signed launch data, matches the existing `REF` pattern, and is never taken from the query string. A direct link `t.me/event_paynow_bot/<app>?startapp=<ref>` therefore opens any event, in groups too. Alternative: one BotFather app per event, impossible.
4. **Shared check in `src/access/`.** `verifyInitData` moves to `src/access/init-data.ts` and the Split app imports it from there, because the Pages Function bundles `src/access/` but must not import `src/split-app/` (the Worker deploy filter and the folder rule). It is pure Web Crypto, so it runs in both. Its tests move with it.
5. **`/web_admin` buttons.** With `EVENT_APP_NAME` (Worker var) set, each event row is `[name → Mini App link] [🌐 browser] [💳 Pay]`; unset, the row is `[name → browser] [💳 Pay]` as now. The link uses the existing `BOT_USERNAME`.

6. **A bearer copy of the session for clients that drop cookies.** Telegram Desktop's web view did not keep the session cookie, so the page showed the Login Widget. `POST /api/miniapp-login` also returns the signed session value; the page keeps it in `sessionStorage`, adds `Authorization: Bearer <value>` to every same-origin request (a small `fetch` wrapper) and loads QR images through `fetch` as blob URLs because an `<img>` cannot send headers. The server reads the cookie first, then the header, through the one `sessionCookie` function, so the expiry and the admin check are unchanged. The header is not sent by a browser on its own, so it adds no cross-site request risk; the value is as exposed as the cookie was, except that script on the page can read it (the page writes all data with `textContent`).

## Risks / Trade-offs

- **Cookies inside Telegram's web view.** If a client blocks the cookie, the page shows the Login Widget as it does today; nothing gets worse. Checked in the live test on one phone and one desktop client.
- **Launch data is valid for a day, a session for 12 hours.** The page posts the launch data on every open, so a stale session is replaced without the user doing anything.
- **Admin rights are still checked live on each request**, so a removed admin loses access even with a valid session. Unchanged.
- **The Pages deploy filter lists `src/access/`**, so moving the file triggers both deploys. Intended.
