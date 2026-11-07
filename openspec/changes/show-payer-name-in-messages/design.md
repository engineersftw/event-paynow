# Design

## Context

The payer's proxy and optional name are stored on `payments` (`payer_type/value/name`). Captions are built inline: the payment QR caption in `start-handler.ts` (`desc / SGD amt / ref / hint`), the received summary in `PaymentCallbackHandler.handleMarkReceived`, the payback QR caption in `PaybackCommandHandler.createPaybackRecord`, and the sent/cancelled summaries in `handlePaybackTransition`. Owner-facing text (payback prompts, "Payback Recorded", payments list, detail) is separate. `paybacks` stores only `payer_type/value` — no name. `payerLabel()` (Markdown-escaped `Name (proxy)`) exists for `parse_mode: 'Markdown'` messages. See proposal.md for scope and assumptions.

## Goals / Non-Goals

**Goals:** show the name consistently; never put a number in a forwardable caption; no schema change.

**Non-Goals:** naming a changed recipient, storing the recipient name on `paybacks`, editing names.

## Decisions

1. **Name only in captions; number only in owner-facing text.** Payment QR captions and the received line are forwarded/visible to others, so they carry `Payer: <name>` and nothing else about the payer. Payback captions/status lines carry `To: <name>`. Owner-facing messages keep showing the proxy alongside the name. *Alternative:* name + number everywhere — rejected, it re-leaks the number the earlier change deliberately kept out of captions.

2. **Segment appended after the reference.** `desc / SGD amt / ref / Payer: Alice / hint`. The reference stays at index 2 of `split(' / ')`, so existing consumers and tests that read it keep working; only the hint's index shifts when a name is present. Segments are built as an array filtered for empties and joined with `' / '`, so a missing name leaves the caption byte-identical to today.

3. **Recipient name is derived, not stored.** A payback recipient has a name only if its proxy equals the payment's stored payer proxy: `recipientName(storedValue, storedName, proxy)` in `payer-label.ts` returns the stored name on a match, else `null`. Messages that have the payment (`PaymentCallbackHandler`: summaries, detail) call it with `payment.payerValue/payerName`. The payback conversation carries `storedPayerValue`/`storedPayerName` in DO state, seeded in `beginFlow` (kept across **Change recipient**, so changing back to the stored proxy restores the name). *Alternative:* add `paybacks.payer_name` — needs another migration and still can't name a changed recipient; rejected as YAGNI.

4. **Two label flavours.** `payerLabel` escapes Markdown for `parse_mode: 'Markdown'` messages (payback proposal, detail, payments list, "Payback Recorded"). Plain-text messages (amount prompt, amount confirm, captions, summary lines) use an unescaped variant so users never see stray backslashes. Names are plain text in captions, so no escaping there.

5. **Where it appears (owner-facing):** amount prompt (`Recipient: Alice (+65…)`), amount-confirm message, "Payback Recorded" (replacing `Payer (now payee): proxy`), `/payments` entries (`$12.50 - Dinner (Alice)`), detail paybacks lines (`$20.00 to Alice (+65…)`).

## Risks / Trade-offs

- [Same-name ambiguity: two payers called "Alice"] → names aren't identities; the reference stays in every caption.
- [Existing tests assert caption text/indices] → updated in the same change; a regression test locks "no name ⇒ caption unchanged".
- [Name with Markdown characters] → escaped in Markdown contexts; plain contexts unescaped by design; covered by tests.
- [In-flight payback conversations from before deploy lack `storedPayer*` context] → treated as "no name"; messages degrade to the bare proxy.
