# Proposal

## Why

`/start` now records the payer's display name, but the bot barely uses it: captions and status lines identify a payment or payback only by description, amount and reference, and payback screens show a bare mobile number. With several payments in flight (a dinner split) the owner has to cross-reference references to know who paid or who is being paid back.

## What Changes

Show the payer's display name wherever it helps identify the person, and nowhere that would leak their number:

- **Payment QR photo caption** (shareable): append `Payer: <name>` after the reference when a name exists. Name only, never the number. Unchanged when there is no name.
- **✓ Received status line** (replaces the QR photo): same `Payer: <name>` segment.
- **Payback QR photo caption** and the **✅ Sent / ❌ Cancelled status lines**: append `To: <name>` after the payback reference when the recipient has a known name.
- **Owner-facing messages** (not forwarded, so the proxy may appear too): the recipient is shown as `Name (+65…)` / bare proxy in the payback amount prompt, the amount-confirm message, the "Payback Recorded" message, the payments-list entries, and the paybacks lines of the payment detail view (`$20.00 to Alice (+65…)`).
- **Recipient name resolution:** a payback's recipient has a known name only when it is the payment's stored payer (the name travels in conversation state and is matched by proxy afterwards). A recipient changed via **Change recipient** has no name, so those messages show only the proxy — no new data is stored and no migration is needed.

Assumptions (recorded, not asked): "captions" covers photo captions and the text lines that replace them; names are shown exactly as typed (40-char cap already enforced); captions never include numbers.

Out of scope: naming a changed recipient, editing names, storing the recipient name on `paybacks`, `/payments` redesign.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `event-scoped-payments`: payer details must not appear in the QR caption → the payer *number* must not; the name may.
- `payment-qr-issuance`: QR caption may include the payer name.
- `payback-qr`: payback captions, status lines, prompts and history show the recipient's name when known.
- `payment-tracking`: received status line and payments list show the payer's name.

## Impact

- `src/commands/payer-label.ts`: shared helpers (caption segment, recipient-name resolution).
- `src/commands/start-handler.ts`, `payment-callback-handler.ts`, `payback-handler.ts`, `payments-handler.ts`: caption/message text.
- Tests asserting caption text and `split(' / ')` positions; new tests for the name/no-name and changed-recipient cases. No schema or migration changes.
