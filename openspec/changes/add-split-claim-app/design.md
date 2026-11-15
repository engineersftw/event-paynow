## Context

See proposal.md - Why. Today the claims of a self-claim split live in the chat's Durable Object (key `split-<chatId>`): `claims[item]` holds ids, `claimers` holds `{ id, name, username? }`, `ways` and `served` hold N-way counts and who has taken a QR. `applyClaim(c, item, op)` is a pure function that changes them; `mutateClaims` reads the state, applies it and writes with `ifRev`, retrying on a newer state; `claimText` / `claimButtons` draw the claim message, which is refreshed with `editMessageText` after each change. All of this sits in `src/commands/split-handler.ts` (about 2,000 lines), and `mutateClaims` takes a grammY `Context` only to check which message a tap came from.

The Worker (`src/worker.ts`) is the only place bound to the Durable Object and holding `SPLIT_BOT_TOKEN`. The Pages site (`web/`) has no Durable Object binding and the Event bot's token, so it cannot serve this.

Telegram facts this relies on (to be confirmed by task 1.1 before building): a `web_app` inline button is allowed only in private chats; in a group, a Mini App opens from a `url` button to `https://t.me/<bot>/<short_name>?startapp=<param>`, which needs the app created once in BotFather (`/newapp`) with a 640x360 picture. The launch data (`initData`) of a Mini App is a query string with `user`, `auth_date`, `start_param`, `hash`; the hash is `HMAC_SHA256(key = HMAC_SHA256("WebAppData", botToken), dataCheckString)` in hex.

## Goals / Non-Goals

**Goals:**
- One screen for items x people; the organiser's edits use the rules that already exist, so the app can never produce a state the chat cannot.
- No second copy of the claim logic: chat taps, chat menu and app share one implementation.
- Off unless configured; no new storage.

**Non-Goals:**
- A general web framework or a build step for the page.
- Member-facing app, live push, finishing the split in the app (see proposal, out of scope).

## Decisions

**The Worker serves the page and the API.** `GET /split-app` returns the HTML; `GET /split-app/api/state` and `POST /split-app/api/claim` are JSON. One origin, so no CORS, and the code that calls the Durable Object and the Bot API is the code that already has them. Alternative: the page on Pages with its API on the Worker: needs CORS, a second deploy path and a cross-script Durable Object binding for nothing. The new code lives in `src/split-app/`, which the deploy filter already treats as Worker code (`src/` except `src/web/`); the page must not import from `src/web/`, whose changes only redeploy Pages.

**Launch by a link button with the chat in the signed data.** The claim message gets `kb.url('✏️ Edit in app', 'https://t.me/<SPLIT_BOT_USERNAME>/<SPLIT_APP_NAME>?startapp=<chatId>_<topicId>')`. The API reads the chat from the `start_param` inside the signed `initData`, never from a query string or body, so a caller cannot ask for another chat by editing a URL. Alternatives: a `web_app` button (not allowed in groups); a menu button or `/app` command (no chat context).

**Authorisation is "the organiser of that chat's active claim", checked on every request.** Verify the hash and `auth_date` (24 hours: a dinner can last long and the page keeps its launch data; claiming itself expires after an hour of inactivity), parse `user.id` and `start_param`, `GET /peek` the chat's Durable Object (read-only, so a probe neither creates state nor extends an expiry), and require `flow === 'split'`, `step === CLAIM` and `owner.userId === user.id`. Anything else is 403 (not the organiser) or 409 `over` (no claiming in progress). The state endpoint answers a member with 403 so the page can say it is for the organiser. Alternative: a signed token in the button URL: more code, and the organiser check is needed anyway.

**Move the claim logic out of the handler, then call it from two places.** Create `src/commands/split-claims.ts` with `applyClaim`, `claimText`, `claimButtons`, the small accessors (`claimsOf`, `claimersOf`, `servedOf`, `waysOf`, `itemLocked`) and `mutateClaimsOn(stub, change, expectMsg?)`, which is today's loop but takes the Durable Object stub and an optional message check instead of a grammY `Context`. `SplitCommandHandler.mutateClaims` becomes a thin wrapper, so every existing test is the proof that nothing changed. The app API calls `mutateClaimsOn` with the same `applyClaim` ops (`toggle` with the organiser as `from` for Mine, `toggleId`, `add` from `resolveTyped`, `clear`, `ways`). Alternative: have the app call the chat handler with a fake `Context` (as the Workflow delivery does): works, but each claim edit would pull in the whole 2,000-line handler for four operations.

**Refresh the chat after each change with a plain `Api`.** After a successful write, `new Api(SPLIT_BOT_TOKEN).editMessageText(chatId, claimMsg, claimText(c), { reply_markup: claimButtons(c) })`, errors ignored (message unchanged or rate limited; the stored claims win), as `refreshClaims` does. The organiser's open chat menu (`c.menu`) is not refreshed: it redraws from the stored state on its next tap, as it does when members tap.

**Typed people reuse `resolveTyped`.** The app sends the text the organiser typed; the server runs `resolveTyped(existing, text, undefined, organiser)` (no text mentions: the Mini App cannot pick from the member list), so the 20-character, 20-person, `@username` and "reuse a matching name" rules are the chat's. The app asks for a name once and puts the person on the item.

**Polling, not push.** The page fetches `/state` every 4 seconds while visible and right after each of its own changes. The state is at most 40 items and 20 people, about a kilobyte or two. A Durable Object WebSocket would be live but needs hibernation handling and a second protocol for a screen used by one person for a few minutes.

**The page is one string.** `src/split-app/page.ts` exports the HTML with inline CSS and a small vanilla script (the repo's other pages work this way, with no bundler). It loads Telegram's script from `telegram.org`, calls `ready()` and `expand()`, uses Telegram's `--tg-theme-*` colours, and sends `Authorization: tma <initData>` with every request. All names and item text are written with `textContent`. The response sets a Content-Security-Policy that allows only itself and `telegram.org` for scripts and itself for connections, with no `frame-ancestors` rule (Telegram Web shows Mini Apps in a frame).

**Configuration.** `SPLIT_APP_NAME` (var). The button and both routes need it and `SPLIT_BOT_TOKEN`; missing, the routes return 404 and the button is not added, matching `/webhook/split`.

## Risks / Trade-offs

- Mini App links from a group may behave differently on some Telegram clients (opens as a sheet or full screen; very old clients may open the bot instead) → task 1.1 checks a real group first; the chat menu stays available, so nobody is blocked.
- The 24-hour launch data window is longer than the claim's own hour → the API still requires an active claim and the organiser on every call, so an old window opens nothing.
- A stale chat menu after an app edit → it redraws on the next tap; edits it would have made are re-applied on the newest state, not blind.
- `telegram-web-app.js` is a script from Telegram, not pinned → it is the documented way and runs only in the organiser's own Telegram; the API trusts only the signed launch data, never the script.
- Moving `applyClaim` and `mutateClaims` touches the most tested part of the handler → do it first, as its own group, with no behaviour change, and run the whole suite before adding anything.
- Names in an item or person could be hostile text → the page writes them with `textContent` only (never `innerHTML`), and a test checks the script for `innerHTML`; the CSP is a second layer.

## Migration Plan

1. Deploy the Worker with no `SPLIT_APP_NAME`: nothing is visible; routes answer 404.
2. In BotFather: `/newapp` for the Split bot, URL `<Worker address>/split-app`, a short name, a 640x360 picture.
3. Set `SPLIT_APP_NAME` in `wrangler.toml` (a var, not a secret) and deploy; the button appears on new claim messages.
4. Rollback: remove the var and redeploy; claim messages lose the button and the routes answer 404. No data to undo.

## Open Questions

- Should the page show each person's running total? It would reuse `shareReceipt` and is useful for checking, but it is a second view of the maths; deferred, it changes no spec or task here.
