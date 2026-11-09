# Design

## Context

Sign-in goes through the Telegram Login Widget; `GET /api/login` verifies the widget data and sets one HttpOnly cookie `session=<userId>.<expiry>.<hmac>`. The cookie holds only the user id, so the pages cannot show a name today. Sessions are stateless and last 12 hours. Both pages are single HTML strings in `src/web/page.ts` that talk to `/api/...`; the admin page shows its sign-in prompt on a 401 and a refusal on a 403. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Show the Telegram name next to a Sign out button on both pages, in every signed-in state, with little new surface.

**Non-Goals:**
- Server-side session revocation, avatars, account switching without signing out.

## Decisions

1. **Name in a second cookie.** `/api/login` also sets `tg_name=<encodeURIComponent(name)>` (HttpOnly, Secure, SameSite=Lax, same max age), where name is `first_name last_name`, else `@username`, else empty, trimmed and cut to 64 characters. The value is display only and never used for access, so it is not signed. Alternative: embed the name in the signed session value, rejected because it changes the session format and invalidates current sessions for no gain.
2. **`GET /api/me`.** Verifies the session cookie and returns `{ user: { name } }` or `{ user: null }`; `name` is the decoded `tg_name` or `null` when absent. It is independent of any event, so the admin page can show the user even on a 403 and the payer page on any state. Always 200, `Cache-Control: no-store`.
3. **`POST /api/logout`.** Same-origin JSON only (the existing guard), then clears both cookies with `Max-Age=0` and returns 204. Works with no session too. The page reloads afterwards. Stateless sessions cannot be revoked server-side, so this removes the cookie from this browser only.
4. **Page.** Both pages call `/api/me` on load and fill a header block (`#me`: name text via `textContent` plus a Sign out button), hidden when `user` is null. A missing name renders "Signed in". The admin page shows it before and independent of the event data, so a 403 still has it; the payer page loads it with the rest of its data.

## Risks / Trade-offs

- The name cookie can be edited by the user → it only changes what that user sees; it is never trusted for access.
- A copied session cookie stays valid after sign out until it expires → accepted for a stateless session; mention in docs.
- Users already signed in see "Signed in" until they sign in again → harmless fallback.
