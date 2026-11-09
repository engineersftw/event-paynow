# Design

## Context

One Worker (`src/worker.ts`) serves Event PayNow Bot at `POST /webhook` with `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET`. The conversation Durable Object (`ChatSessionDO`) is keyed `chat-<chatId>` and stores `{flow, step, context, owner}` with a 10-minute alarm. In a private chat the chat id equals the user id, so a second bot using the same key would share state with the first. Reusable pieces: `buildPayNowPayload` (editable when no amount, description in tag 62.01, truncated to 25), `renderQrPng(payload, lines)`, `detectProxyType`, `parseAmount`, `InputFile` photo upload as in `start-handler.ts`.

## Goals / Non-Goals

**Goals:** a tiny, stateless-by-design QR bot on the same deployment; no new infrastructure.

**Non-Goals:** events, tracking, web pages, saved payees, group use, abuse limiting beyond Telegram's.

## Decisions

1. **Second route in the same Worker** (`POST /webhook/simple`), own secret header check (`SIMPLE_WEBHOOK_SECRET`) before the bot is built, same pattern as `/webhook`. Env gains `SIMPLE_BOT_TOKEN`, `SIMPLE_WEBHOOK_SECRET` (secrets) and `SIMPLE_BOT_USERNAME` (var, `Simple_PayNow_Bot`). Alternatives (separate Worker or repo) were rejected for setup cost and duplicated SGQR code.
2. **Own bot factory** `createSimpleBot(env, config?)` in `src/simple-bot.ts` (grammY, cached per isolate like the event bot) with a `SimpleCommandHandler` in `src/commands/simple-handler.ts`. It shares no handlers with the event bot, so the two cannot answer each other's updates.
3. **Conversation state in the existing DO, under key `simple-<chatId>`**, flow value `simple` (added to the zod enum in `conversation-do.ts`; the enum change is additive). Steps: 1 payee, 2 amount, 3 payer may change amount (only when an amount was given), 4 description. Context holds the answers; `POST /reset` clears them when the QR is sent or on `/cancel`, and the existing alarm clears an abandoned one after 10 minutes. No D1 access at all (the bot is built without the repository).
4. **Skip, Yes and No are inline buttons** (`simple_skip_amount`, `simple_skip_description`, `simple_edit_yes`, `simple_edit_no`); typing text also works. Skip callbacks only act when the stored step matches (stale buttons answer "That step is over").
5. **Validation:** payee via `detectProxyType` (normalises `+65` mobiles, checks UEN); amount via `parseAmount`; description is trimmed and rejected over 25 characters rather than silently cut. Non-printable-ASCII characters are removed by the payload builder's existing `truncateAnsi`; the bot says so in `/help`, and the check counts characters after that cleaning so what the user sees equals what is encoded.
6. **Output:** `renderQrPng(payload, lines)` where `lines` are the description (if any) and `SGD x.xx` / `Amount: set by payer`, never the payee number. It is sent with `replyWithPhoto` and a caption with the same facts. The "keep this QR for check-in" reminder is not added (there is no check-in here). The reference tag 26.05 is omitted and the merchant name stays the builder default.
7. **Private chats only:** `ctx.chat.type !== 'private'` → `/start` replies with a one-line "message me directly" note; all other group updates are ignored silently. This also avoids group privacy-mode and conversation-owner rules.
8. **Editable amount:** the builder takes `amountCents` and `editable` separately (tag 54 and tag 26.03) but used to drop tag 54 whenever `editable` was true. No existing caller combines the two, so it now keeps the amount whenever one is given; `editable` only controls 26.03. A node test covers the combination. The caption adds "(payer can change)" in that case.
9. **Logging:** no `console.log` of updates or answers in this bot's path.

## Risks / Trade-offs

- **Shared DO namespace:** the separate key prefix is the only isolation; covered by a test that runs both bots against one chat id.
- **No abuse limiting:** anyone can generate unlimited QR codes. Each costs a little CPU; accepted for now, Telegram's per-bot rate limits apply.
- **A typo in the payee sends money to the wrong person.** The bot cannot look up the payee's name, so the only check is the payer's banking app showing the name when it scans the QR. `/help` says to check it.
- **Bank-app support:** an editable amount with a preset value (tag 03 = 1 plus tag 54) is valid SGQR, but whether each banking app lets the payer edit a preset amount is not verified here; test with at least one real bank app before relying on it.
- **Second token to manage**; `setWebhook` for the new bot must point at `/webhook/simple` with the new secret.
