# Tasks

## 1. Data layer

- [x] 1.1 Add `listPaymentsByEvent(eventId)` (newest first) to the `Repository` interface and `D1Repository`; verify with a workers-pool repository test covering multiple users, ordering and an empty event.

## 2. Pages app

- [x] 2.1 Create the `web/` Pages project (`public/`, `functions/`, `wrangler.toml` with the `paynow_db` binding) plus `npm run web:dev` / `web:deploy` scripts and a `tsconfig` for the functions included in `npm run build`; verify `npm run build` passes.
- [x] 2.2 Implement Telegram Login verification (HMAC-SHA256 with `SHA256(bot_token)`, 24 h freshness) and the signed session cookie (12 h) as runtime-agnostic helpers; verify with node-pool tests for valid, tampered, stale and expired cases.
- [x] 2.3 Implement the chat-admin authorisation helper (`getChatMember` → creator/administrator, private chat owner, deny on API error); verify with tests using a stubbed fetch for admin, member, outsider, private chat and API failure.
- [x] 2.4 Implement `GET /api/login`, `GET /api/events/:ref` (event, totals excluding voided, payments with payer name only; 401 / 403 / 404) and the `GET /events/:ref` page with the login widget and read-only table; verify with workers-pool tests that unauthenticated and non-admin requests get no payment data and no PayNow numbers appear in the JSON.

## 3. Bot entry command

- [x] 3.1 Add `src/commands/web-admin-handler.ts` for `/web_admin` (event list with url buttons, empty-chat message), `WEB_ADMIN_URL` in `Env` and `wrangler.toml`, route in `src/bot.ts`, and `/help` text; verify with a node test for both scenarios and a bot-wiring test.

## 4. Docs and rollout

- [x] 4.1 Document in `AGENTS.md` and `README.md`: the Pages project, secrets, BotFather `/setdomain`, `WEB_ADMIN_URL`; run `npm run check`, `npm run build`, `npm test` and confirm all pass.

## Workflow follow-up

- Create the Pages project, bind D1, set secrets, run `/setdomain` with BotFather, set `WEB_ADMIN_URL`, deploy the Worker and the Pages app, then try sign-in as an admin and as a non-admin.
