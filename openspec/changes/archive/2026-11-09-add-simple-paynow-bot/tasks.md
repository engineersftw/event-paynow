# Tasks

## 1. Plumbing

- [x] 1.1 Add `simple` to the conversation flow enum in `src/worker/conversation-do.ts`; add `SIMPLE_BOT_TOKEN`, `SIMPLE_WEBHOOK_SECRET`, `SIMPLE_BOT_USERNAME` to `src/env.ts` and `[vars]` in `wrangler.toml`
- [x] 1.2 Route `POST /webhook/simple` in `src/worker.ts`: validate `SIMPLE_WEBHOOK_SECRET` first (403), then hand to the simple bot's webhook callback

## 2. Bot

- [x] 2.1 `src/commands/simple-handler.ts`: payee → amount → (amount given only) payer-may-change Yes/No → description steps, Skip/Yes/No buttons (step-guarded), validation messages, `/cancel`, reset on completion
- [x] 2.2 Build the QR (`buildPayNowPayload`: fixed amount, editable amount with a starting value, or no amount; description in 62.01), render with `renderQrPng` using description/amount lines only, send as a photo with a caption that never contains the payee number
- [x] 2.3 `src/simple-bot.ts`: `createSimpleBot` (private-chat guard with the group note, `/start`, `/help`, `/cancel`, callbacks, text routing), DO stub keyed `simple-<chatId>`, no D1 access

## 3. Tests

- [x] 3.1 Builder test (node): an amount with `editable` keeps tag 54 and sets 26.03 = 1; validation, the extra question (asked only when an amount was given), fixed vs editable payload, skip paths and cancel are covered end to end in the Workers file of 3.2
- [x] 3.2 Workers e2e (grammY with stubbed fetch and `botInfo`, as in `start-flow.test.ts`): full conversation returns a QR that decodes to the payee and amount; group `/start` gets the note; wrong secret on `/webhook/simple` gives 403; both bots in the same private chat keep separate conversations; no D1 rows are written

## 4. Docs and release notes

- [x] 4.1 Update `README.md` (new bot, BotFather commands, secrets, `setWebhook` for `/webhook/simple`), `AGENTS.md` (components, secrets, workflow list) and `docs/architecture.md`
- [x] 4.2 Run `npm run check`, `npm run build` and the full test suite
