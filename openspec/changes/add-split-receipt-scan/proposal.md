## Why

Splitting a restaurant bill means typing the total, then working out who had what, then adding GST and service charge to each person's share. The receipt already has all the numbers. Reading the photo for the organiser removes the typing and the arithmetic, and it makes the custom split (and the mentions and QRs built on it) practical for real bills.

## What Changes

- Add **`/split_receipt`** to Split_PayNow_Bot: the user sends a photo of the receipt, and a vision model on Cloudflare Workers AI reads the merchant name, the line items with prices, the service charge, GST, any discount, and the total. A photo sent when the bot asks for the bill total is read the same way.
- The bot shows what it read (numbered items, charges, total, and a warning if the numbers do not add up) with **Use this**, **Send another photo** and **Type the total instead**. Nothing is trusted until the user taps Use this.
- The user then says who had each item in one message, one line per group of items:
  `1,3 Ann` (Ann had items 1 and 3), `2 Ann, Bob` (item 2 is shared), `4 me`, `5 all` (shared by everyone named). `me` is the organiser, whose own share is counted but not collected. People can be plain names or **@mentions**, so the existing DM delivery works.
- The bot works out each person's amount: their items (a shared item is split equally) plus a **pro-rata share of the service charge, GST and any discount**, so the amounts add up to the receipt total to the cent. It then continues exactly like a custom split: payee, description, summary with Confirm / Amend / Cancel, one QR per distinct amount, DMs to mentioned people.
- Amend gains an **Items** choice (say who had what again), and editing the assignment message works like any other edited answer.
- Receipt photos are read in memory and **never stored**; the scan result lives in the chat's conversation state for at most 10 minutes like other answers.

Out of scope: correcting individual scanned items or prices in chat (send another photo or type the total), currencies other than SGD, PDF or multi-page receipts, remembering merchants, and `/stats`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities
- `bill-split-bot`: receipt scanning, assignment of items to people, pro-rata charges, and hand-off to the custom split.

## Impact

- New: `src/commands/receipt.ts` (scan validation, assignment parsing, share maths), `src/receipt-reader.ts` (`ReceiptReader` interface and a Workers AI implementation).
- Changed: `src/commands/split-handler.ts` (new steps, photo handling, review buttons, Items amend), `src/split-bot.ts` (photo update, `/split_receipt`, reader wiring), `src/env.ts` (optional `AI` binding and `RECEIPT_MODEL` var), `wrangler.toml` (`[ai]` binding, model var), tests.
- No database change and no new secret. A new **Workers AI binding**: usage is metered by Cloudflare (a free daily allowance, then paid) and some vision models need a one-time licence acceptance.
- Docs: README (feature, setup, privacy note, the BotFather command `split_receipt`), `AGENTS.md`, `docs/architecture.md`.
- Risk: vision models misread receipts, so the review step, the arithmetic warning and "type the total instead" are part of the design, not extras.
