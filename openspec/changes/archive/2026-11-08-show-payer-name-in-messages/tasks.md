## 1. Helpers

- [x] 1.1 In `src/commands/payer-label.ts` add a plain (unescaped) label, `recipientName(storedValue, storedName, proxy)`, and a small caption-segment helper (`'Payer'`/`'To'` + name, empty when no name)
- [x] 1.2 Unit tests for the helpers (name/no name, match/mismatch, Markdown escaping vs plain)

## 2. Payment captions

- [x] 2.1 `start-handler.ts`: append `Payer: <name>` after the reference in the QR caption; identical to today when no name
- [x] 2.2 `payment-callback-handler.ts`: add `Payer: <name>` to the ✓ Received status line
- [x] 2.3 `payments-handler.ts`: show the (Markdown-escaped) payer name in each payments-list entry
- [x] 2.4 Update/add tests: caption with name (no number present), caption without name unchanged, received line, list entry

## 3. Payback messages

- [x] 3.1 `beginFlow`: seed `storedPayerValue`/`storedPayerName` in conversation state
- [x] 3.2 `payback-handler.ts`: `To: <name>` in the QR caption; `Recipient: Name (proxy)` in the amount prompt, amount-confirm message and "Payback Recorded" message
- [x] 3.3 `payment-callback-handler.ts`: `To: <name>` in the Sent/Cancelled status lines; `to Name (proxy)` in detail paybacks lines (via `recipientName`)
- [x] 3.4 Tests: stored payer named everywhere; changed recipient shows bare proxy and no `To:`; changing back to the stored proxy restores the name; legacy state without `storedPayer*` degrades to bare proxy; workers e2e check of caption/summary text

## 4. Docs and verification

- [x] 4.1 Update `AGENTS.md` (caption/status-line conventions: name only in captions, number only in owner-facing text); run `npm run build`, `npm run check`, `npm test`
