## Context

Telegram delivers a photo as a `message:photo` update with several sizes; `getFile` returns a path from which the bytes can be downloaded with the bot token. Cloudflare Workers AI offers vision models behind an `AI` binding (`env.AI.run(model, input)`). The custom split already handles named people, @mentions, DMs, Amend and edited messages, so a receipt only needs to produce the list of names and amounts that the custom flow consumes. The flow already stores everything in the Durable Object context and `nextNeed` decides the next question.

## Goals / Non-Goals

**Goals:** photo to total and items; assign items to people; pro-rata GST and service charge; reuse the custom split from there; nothing stored.

**Non-Goals:** editing scanned items in chat, other currencies, multi-page receipts, merchant memory.

## Decisions

1. **Reader behind an interface.** `ReceiptReader.read(image: Uint8Array): Promise<RawScan>` in `src/receipt-reader.ts`. The production implementation calls `env.AI.run(model, …)` with the image and a fixed instruction asking for JSON only. Tests inject a fake, so no test needs the AI binding. `createSplitBot(env, token, config, deps?)` takes `deps.reader`; with no reader and no `env.AI` the receipt entry points answer "Receipt scanning is not available" and fall back to a typed total.
2. **Model is configuration.** `RECEIPT_MODEL` (var in `wrangler.toml`) names the vision model. The default is an instruction-tuned vision model from the Workers AI catalogue; the exact id, its input shape (image bytes or a data URL) and any one-time licence acceptance must be checked against the current Cloudflare documentation when the task is applied, and the README records the result. The `[ai]` binding is remote-only, so the Workers test pool must not need it: if the pool rejects the binding, the binding is declared only for deploy and tests never construct the real reader.
3. **Never trust the model.** The reader's output is parsed with a zod schema into integer cents: finite prices above zero and below a sanity cap, at most 40 items, names trimmed to 30 characters with control characters removed, and a total that must be present and positive. Receipt text is untrusted input: it only ever reaches the user as plain text (no parse mode) and never influences the flow. Anything invalid yields "could not read" with the fallback buttons.
4. **Steps:** `RECEIPT` (waiting for a photo), `REVIEW` (buttons: `split_scan:use|again|manual`), `ASSIGN` (waiting for the assignment text). `/split_receipt` starts at `RECEIPT`; a photo at the `TOTAL` step is routed to the same reader. In a group the photo prompt is a force-reply so privacy mode still delivers the photo.
5. **`nextNeed` extended:** if the context holds a used receipt and no `entries`, the next need is `ASSIGN`; otherwise the existing order applies. Using a scan sets `totalCents`, `mode: 'custom'` and `leftover: 'omit'` (the organiser's own share is the leftover). The assignment answer sets `entries` (everyone but `me`), so payee, description and summary follow without new code. The summary already shows "Leftover … left out: you cover it", which is the organiser's share.
6. **Assignment grammar** (`parseAssignments(text, itemCount, mentions)`): per line, leading tokens that are numbers or ranges (`1`, `1,3`, `2-4`, separated by commas or spaces) are items; the rest is a comma-separated list of people. A person is a name, an @username, a text mention, `me` or `all`. `all` expands to every distinct person named in the message (including `me` if named). Each item must appear in exactly one line; unknown numbers, duplicates and unassigned items are reported by number. At most 20 distinct people, names unique ignoring case, same limits and identity rules as the custom list.
7. **Share maths** (`shareReceipt(items, assignments, totalCents)`), all in integer cents:
   1. each item is split among its people, the remainder cents going to the first people listed;
   2. each person's item subtotal is the sum of their shares;
   3. `extras = totalCents − sum(items)` (service charge, GST, rounding, discount; may be negative);
   4. extras are allocated in proportion to subtotals with the largest-remainder method, so the person amounts, plus the organiser's, add up exactly to `totalCents`.
   Using the receipt total (not the sum of its parts) makes a misread GST line harmless: the total on the receipt is what was actually charged.
8. **Review warnings:** items summing above the total, a missing or zero total, and a large gap between `subtotal + service + GST − discount` and the total (when those were read) are shown on the review message. The user can still use the scan, send another photo or type the total.
9. **Amend and edits:** Amend gains an **Items** choice (only when a receipt is in use) that returns to `ASSIGN`; `assign` becomes a field of the answer/edit machinery (`FIELD_OF_STEP`, `answerMsgs`), so editing the assignment message works.
10. **Photo handling:** take the largest size Telegram offers, `getFile`, download from `https://api.telegram.org/file/bot<token>/<path>` (the handler receives the bot token only for this), cap the download at a size the model accepts, keep the bytes in memory for the single call, never log them. A "reading your receipt…" chat action is sent while the model runs.

## Risks / Trade-offs

- [Vision models misread prices, drop lines or invent them] → mandatory review, arithmetic warning, retake and typed-total fallbacks; the pro-rata method trusts only the receipt total.
- [Workers AI cost or limits] → metered by Cloudflare; one call per photo; documented. A per-chat limit is not added in the MVP.
- [Model availability or licence prompt changes] → model id is a var; README documents the one-time acceptance.
- [Assignment text is fiddly on a phone] → one worked example in the prompt, per-line errors, mentions reuse existing behaviour; item buttons are a later improvement.
- [Photos contain personal data (card tails, names)] → processed in memory by Workers AI only, not stored or logged; stated in the README.

## Migration Plan

No database change. Add the `[ai]` binding and `RECEIPT_MODEL` var, deploy, accept the model licence once if required, and add `split_receipt - Split a bill from a receipt photo` to the BotFather commands. Rollback: remove the binding; the feature then reports scanning as unavailable.
