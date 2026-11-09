# Proposal

## Why

Event PayNow Bot needs an event, a chat admin and a database before it produces a QR code. Many people just want a PayNow QR for one payee, quickly, without any of that. A second bot, **Simple_PayNow_Bot**, does only that: ask a few questions, return a QR image.

## What Changes

- New Telegram bot `Simple_PayNow_Bot`, served by the **same Worker** on a second webhook route (`POST /webhook/simple`) with its own bot token and webhook secret.
- Conversation in a private chat: **Payee** (mobile or UEN, required) → **Amount** (optional; Skip button leaves it for the payer to key in) → if an amount was given, **Can the payer change the amount?** (Yes / No buttons) → **Description** (optional, up to 25 characters; Skip button) → the bot sends the PayNow QR image.
- Reuses the existing SGQR payload builder, QR renderer (logo, text band), payee validation, amount parsing and the per-chat Durable Object for the short conversation.
- **Nothing is stored**: no database tables, no payment records. Only the in-progress answers live in the Durable Object, for at most 10 minutes, under a key separate from the event bot's.
- `/start` begins, `/cancel` abandons, `/help` explains. Docs, BotFather command list and deploy notes updated.

Out of scope: events, payer/payment tracking, paybacks, web pages, saved payees, group-chat use, rate limiting beyond Telegram's own.

## Capabilities

### New Capabilities

- `simple-paynow-bot`: the standalone QR-only bot and its conversation.

### Modified Capabilities

(none)

## Impact

- New: `src/simple-bot.ts`, `src/commands/simple-handler.ts`; changed: `src/worker.ts` (route), `src/env.ts` and `wrangler.toml` (new vars/secrets), `src/worker/conversation-do.ts` (`simple` flow value), tests, README, AGENTS.md, `docs/`.
- Worker deploy only (the Worker filter already covers `src/`); no migration.
- Needs two new secrets (`SIMPLE_BOT_TOKEN`, `SIMPLE_WEBHOOK_SECRET`) and a `setWebhook` call for the new bot.
