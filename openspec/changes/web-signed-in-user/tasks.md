# Tasks

## 1. Session and API

- [x] 1.1 In `/api/login`, also set the `tg_name` cookie (first and last name, else `@username`, else empty; URL-encoded, 64 characters max, same flags and max age as `session`). Verify with a web handler test: a valid sign-in sets both cookies, and a long or non-ASCII name round-trips encoded.
- [x] 1.2 Add `GET /api/me` (user name or null, never an error, `no-store`). Verify with web handler tests: valid session with the name cookie, valid session without it (`name: null`), no or expired session (`user: null`), and a forged name cookie without a session still gives `user: null`.
- [x] 1.3 Add same-origin `POST /api/logout` that clears `session` and `tg_name` and returns 204. Verify with web handler tests: both cookies are cleared with `Max-Age=0`, a cross-origin request is refused with 403 and clears nothing, and `/api/me` with no cookies afterwards reports no user.

## 2. Pages

- [x] 2.1 Add the header user block (name and Sign out) to the event page, filled from `/api/me`, shown also when the event data is refused with 403, reloading after sign out. Verify with web-page tests on the rendered HTML and script, and by opening the page signed in as an admin and as a non-admin.
- [x] 2.2 Add the same block to the payer page, hidden for anonymous visitors, reloading after sign out. Verify with web-page tests and by signing in and out on `/pay/<ref>`.

## 3. Docs and checks

- [x] 3.1 Update README and AGENTS.md (name display, sign out, the `tg_name` cookie, `/api/me`, `/api/logout`, and that sign out does not revoke a copied cookie). Verify by reading the diff.
- [x] 3.2 Run `npm run check`, `npm run build` and `npm test`; all pass.
