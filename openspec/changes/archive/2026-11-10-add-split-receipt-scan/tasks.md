## 1. Receipt maths and parsing

- [x] 1.1 Add `src/commands/receipt.ts`: zod schema and `parseScan` turning raw reader output into integer cents (positive total required, finite sane prices, at most 40 items, cleaned names), `scanWarnings`, `parseAssignments(text, itemCount, mentions)` (numbers and ranges, comma-separated people, `me`, `all`, mentions, unique names, errors by item number) and `shareReceipt(items, assignments, totalCents)` (equal item shares with remainder to the first people, pro-rata extras by largest remainder, exact total)
- [x] 1.2 Add `test/node/receipt.test.ts`: valid and invalid scans, warnings, every assignment error, `all` and `me`, shared items, the 48.00 example (36.00 and 12.00), a discount (negative extras), odd-cent allocation always adding up to the total

## 2. Reader

- [x] 2.1 Add `src/receipt-reader.ts` with the `ReceiptReader` interface and a Workers AI implementation (fixed JSON-only instruction, image from bytes, tolerant JSON extraction from the reply); check the current Workers AI docs for the vision model id, input shape and licence step, and set `RECEIPT_MODEL`
- [x] 2.2 Add the `[ai]` binding and `RECEIPT_MODEL` var to `wrangler.toml` and optional `AI` / `RECEIPT_MODEL` to `src/env.ts`; make sure the Workers test pool still runs (declare the binding only where it does not break tests)

## 3. Conversation

- [x] 3.1 In `split-handler.ts` add steps RECEIPT, REVIEW and ASSIGN, `/split_receipt` start, the photo handler (largest size, `getFile`, download with the bot token, chat action, call the reader, never log), and a photo accepted at the TOTAL step
- [x] 3.2 Show the review (numbered items, charges, total, warnings) with `split_scan:use|again|manual`; Use this sets total, `mode: 'custom'` and `leftover: 'omit'`; manual falls back to the typed total; handle unreadable photos and a missing reader with the same fallbacks
- [x] 3.3 Extend `nextNeed` (receipt without entries means ASSIGN), add the assignment prompt and answer (`assign` field, entries without `me`, identities from mentions), and make editing the assignment message work
- [x] 3.4 Add Items to the Amend menu when a receipt is in use
- [x] 3.5 In `split-bot.ts` route `message:photo` to the handler, add `/split_receipt`, and inject the reader through `createSplitBot` dependencies

## 4. Tests and docs

- [x] 4.1 Extend `test/workers/split-bot.test.ts` with a fake reader and a stubbed photo download: full receipt flow with a mention and a plain name, photo at the total prompt, unreadable photo, warning on mismatch, reader missing, assignment errors, Amend Items, edit of the assignment message, `me` share left out, nothing written to the database
- [x] 4.2 Update README (feature, `[ai]` binding and model setup, privacy note, BotFather command `split_receipt`), `SPLIT_HELP`, `AGENTS.md` and `docs/architecture.md`
- [x] 4.3 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
