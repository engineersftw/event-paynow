# Proposal

## Why

Once someone signs in with Telegram, the web pages give no sign of who they are signed in as and no way to leave that session. A person on a shared phone, or an admin who signed in with the wrong account and got "not allowed", has to wait up to 12 hours for the session to expire.

## What Changes

- The web admin page and the payer page show the signed-in user's name in the header, with a Sign out button next to it.
- Sign out ends the session on this browser and reloads the page: the admin page returns to its sign-in prompt and the payer page returns to the anonymous form.
- The name comes from the Telegram sign-in (first and last name, or the username when there is no name) and is remembered in the browser with the session. Sessions that began before this change have no name and show a plain "Signed in" label with the Sign out button.
- The signed-in indicator also appears when the admin page refuses a signed-in user who is not an admin, so they can switch account.
- A new `GET /api/me` returns the current user's display name (or none), and a new same-origin `POST /api/logout` clears the session.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `web-admin`: the event page shows the signed-in user and offers sign out.
- `event-payment-page`: the payer page shows the signed-in user and offers sign out.

## Impact

- `src/web/handler.ts` (name cookie on login, `/api/me`, `/api/logout`), `src/web/page.ts` (header user block on both pages), `src/web/auth.ts` only if a cookie helper is shared.
- Tests: web handler tests (login sets the name, `/api/me`, logout clears cookies, cross-origin logout refused) and page tests.
- README and AGENTS.md notes on the web pages.
- No migration, no new secrets.
- Out of scope: server-side session revocation (sessions are stateless signed cookies, so a copied cookie stays valid until its 12 hour expiry), profile photos, switching accounts without signing out first.
