## Why

Split_PayNow_Bot only splits a bill equally. Real bills are not equal: someone had the wine, someone left early, someone covers a friend. Today the organiser has to work the amounts out by hand and cannot use the bot at all. Letting them enter each person's amount keeps the bot useful for the bills that actually cause arguments.

## What Changes

- After the bill total, `/split` asks **how to split**: **Equally** (today's flow, unchanged) or **Custom amounts**.
- Custom amounts: the organiser sends one list, one person per line, as `Name amount` (e.g. `Ann 40` and `Bob 25.50`). The people listed are the ones who pay the organiser; the organiser is left out.
- The bot checks the list against the bill total:
  - the list adds up to **more** than the bill: rejected with the difference, the organiser sends the list again;
  - the list adds up to **exactly** the bill: continues;
  - the list adds up to **less** than the bill: the bot asks what to do with the leftover, **Split it evenly** between the listed people (each share rounded up to the cent, so the organiser is never short) or **Leave it out** (the organiser covers it).
- **`/split_custom`** is a shortcut: it asks for the total and then goes straight to the custom list, skipping the Equally / Custom question. It works in private chats and groups like `/split`.
- Then payee and optional description as before, and the same Confirm / Cancel summary, which lists every person's final amount and the leftover handling.
- On Confirm the bot sends **one QR per distinct amount**, each labelled with the names that owe it, so a bill with six people and three different amounts sends three QRs. Fixed amount, not editable, no payee number, as today.
- Limits: 1 to 20 people in the list, names up to 20 characters and unique (ignoring case), each amount positive with at most two decimals.

Out of scope: splitting by item or by weights/percentages, keeping a person's name linked to a payment, tracking who has paid, editing one entry after sending the list (send the list again), and `/stats` figures.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities
- `bill-split-bot`: the questions gain a split-type choice and a custom-amounts path with leftover handling; the summary lists per-person amounts; the QR step sends one QR per distinct amount for custom splits.

## Impact

- Changed: `src/split-bot.ts` (new `/split_custom` command), `src/commands/split-handler.ts` (new steps and branch), `src/commands/split-math.ts` (parse the list, leftover maths, group by amount), `test/node/split-math.test.ts`, `test/workers/split-bot.test.ts`.
- No database change, no new dependency, no new route, secret or variable; the equal flow behaves exactly as before.
- Manual setup: add `split_custom - Split a bill with custom amounts` to the bot's command list in BotFather.
- Docs: README (Split_PayNow_Bot section), `AGENTS.md`, `docs/architecture.md`.
- Behaviour risk: a custom split can send up to 20 QR messages in a row; in a busy group Telegram may rate-limit sends, in which case the bot stops and says how many were sent.
