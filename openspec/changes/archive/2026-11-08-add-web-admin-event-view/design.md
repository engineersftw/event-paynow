# Design

## Context

The bot is a single Worker (`src/worker.ts`) with D1 (`paynow_db`), `D1Repository`/`D1EventRepository`, and `createBot`. Events are keyed by `(chat_id, topic_id)`; payments carry `event_id` and `user_id` and today can only be listed per user (`listPaymentsByUser`). Events store no creator. Nothing web-facing exists besides the webhook.

## Goals / Non-Goals

**Goals:**
- A minimal, safe, read-only event page reachable only by that chat's admins.
- Reuse the existing repository layer and D1 database; no schema change.

**Non-Goals:**
- Any write action, multi-event dashboards, search, export, custom domain, or a general web framework.
- Roles beyond "chat admin".

## Decisions

1. **Pages project in `web/` with Pages Functions, bound to the same D1.** Functions import `D1Repository` from `../src`, so queries and types stay shared. Alternative: static Pages calling a new JSON API on the bot Worker — adds a cross-origin surface and a second deployable to secure.
2. **Telegram Login Widget for identity.** The widget returns `id, first_name, auth_date, hash, ...`; the function verifies `hash` as HMAC-SHA256 over the sorted `key=value` data-check-string with key `SHA256(bot_token)` (Web Crypto), and rejects `auth_date` older than 24 h. The user chose this over a signed link. Needs a one-time BotFather `/setdomain` for the Pages domain.
3. **Session = signed cookie.** After verification, set an HttpOnly, Secure, SameSite=Lax cookie holding `userId.expiry` HMAC-signed with `SESSION_SECRET`, valid 12 h. No session table. Alternative: store sessions in D1 — revocation we don't need yet.
4. **Authorisation per request via the bot API.** The event page function loads the event by ref, then calls `getChatMember(event.chatId, userId)` with the bot token and allows `creator` / `administrator`; for a private chat (`chatId === userId`) the user is the owner. Not stored in D1, so demoted admins lose access immediately. Alternative: trust event creator — events don't store one, and a migration is out of scope. A failed `getChatMember` call denies access.
5. **Routes.** `GET /events/:ref` serves the page; `GET /api/events/:ref` returns JSON `{event, totals, payments}` for it after the same auth check; `GET /api/login` (the widget redirects with a GET) verifies widget data and sets the cookie. The page is plain HTML plus a small inline script, no framework or build step.
6. **Data shaping server-side.** The API returns payer name only (never `payer_value` or payee numbers) so the page can't leak numbers. New repository method `listPaymentsByEvent(eventId)`; totals computed from the same rows (voided excluded) — or reuse `getEventStats`.
7. **`/web_admin` handler** lists `listAllEventsByChat(chatId, topicId)` and replies with url inline buttons to `${WEB_ADMIN_URL}/events/<ref>`. Link buttons carry no secret; access is enforced by sign-in.

## Risks / Trade-offs

- [Event refs are guessable only by chat members] → access still needs Telegram sign-in and admin check; refs aren't treated as secrets.
- [Pages Functions and the Worker diverge on env/types] → shared repository code; a type-check covers `web/functions` via a separate tsconfig in CI.
- [Login Widget fails on an unregistered domain] → document the `/setdomain` step in the README and tasks; preview deployments won't sign in.
- [Bot API outage blocks viewing] → deny with a clear message; acceptable for a view-only admin tool.
- [Cookie theft] → HttpOnly, Secure, 12 h expiry; data is read-only.

## Migration Plan

1. Merge code; create the Pages project, bind D1, set `TELEGRAM_BOT_TOKEN` and `SESSION_SECRET`.
2. Run BotFather `/setdomain` with the Pages domain; set `WEB_ADMIN_URL` on the Worker and deploy it.
3. Rollback: remove the `/web_admin` route (or the Pages project); no data changes to undo.

## Open Questions

- Should plain members (not admins) get access later? Out of scope now; the check is one function.
