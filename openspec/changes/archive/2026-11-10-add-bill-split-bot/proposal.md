## Why

After a meal or a trip, someone pays the bill and then has to work out each person's share and collect it. Event PayNow Bot is built around events and Simple_PayNow_Bot makes one QR for a number you already know, so neither answers "we owe S$187.40 between us, what does each person pay?". A small bot that does the sum and hands back a PayNow QR for each person's share closes that gap, and it reuses the QR code we already have.

## What Changes

- Add a third Telegram bot, **Split_PayNow_Bot**, served by the same Worker at `POST /webhook/split`. It answers 404 until `SPLIT_BOT_TOKEN`, `SPLIT_WEBHOOK_SECRET` and `SPLIT_BOT_USERNAME` are set, like the Simple bot.
- `/split` asks for the bill total, then how many people share it, then the payee (mobile or UEN) and an optional description, shows a summary with Confirm / Cancel, and only then sends one PayNow QR for a single person's share.
- Equal split only (the MVP). In a group chat the bot reads the group's member count and offers it as the number of people ("Split by 6"); the user can always type another number. In a private chat the user types the number.
- The share is rounded **up** to the next cent so the person who paid is never short. The summary and the QR caption show the share and any small over-collection.
- Works in private chats and in groups. In a group only the person who started `/split` can answer it, and the payee number is never shown back in the group.
- Nothing is stored: answers live in the chat's Durable Object for at most 10 minutes, the same as the Simple bot.

Out of scope for the MVP: unequal splits (by item, percentage or custom amounts), tracking who has paid, per-person QR codes, a database table, currencies other than SGD, and `/stats` figures for the new bot.

## Capabilities

### New Capabilities
- `bill-split-bot`: the Split_PayNow_Bot conversation: total, number of people (group member count suggestion), payee, optional description, confirmation, equal-share maths with round-up, and the share's PayNow QR.

### Modified Capabilities

(none)

## Impact

- New: `src/split-bot.ts` (bot factory and webhook handler), `src/commands/split-handler.ts`, `src/commands/split-math.ts`.
- Changed: `src/worker.ts` (new `/webhook/split` route), `src/env.ts` (three optional bindings), `src/worker/conversation-do.ts` (new `split` flow value), `wrangler.toml` (`SPLIT_BOT_USERNAME` var).
- No database migration, no new dependency, no web page change.
- Docs: README (new section, setup steps, project tree, specs count 18), `AGENTS.md`, `docs/architecture.md`.
- Manual setup after deploy: create the bot in BotFather, set the two secrets, register the webhook, and, in groups, make the bot an admin that may delete messages so it can remove the payee message (optional). Group privacy mode must stay on: the bot then sees only commands and replies to its own messages, which is all it needs.
