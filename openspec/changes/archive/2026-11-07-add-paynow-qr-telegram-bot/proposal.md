# Proposal

## Why

Collecting ad-hoc payments in Singapore via PayNow currently requires opening a bank app, creating a QR, and saving/sending screenshots, with no easy way to record which QR corresponded to which payment or to send money back. A Telegram bot that generates valid SGQR PayNow QR images on demand lets any user collect payments, share them, track receipts, and issue paybacks from one chat.

## What Changes

- New Telegram bot (greenfield service) that any Telegram user can operate with their own PayNow Payee reference.
- `/init` command: interactive setup of the user's Payee reference (SG mobile number or UEN), validated and persisted per user.
- `/start` (payment creation) command: guided conversation asking for a payment description and amount, then responds with an inline SGQR PayNow QR image encoding the payee reference, amount, and description.
- QR messages include a share option using Telegram's native forward/share dialog so the user can send the QR to any chat or person.
- Payment tracking: every generated QR creates a payment record (pending); users can list their payments and manually mark one as received. Data model and flows are designed to be webhook-ready for future automated bank payment notifications, but receipt detection in this change is manual only.
- Payback: from a received payment, the user can trigger a payback — the bot asks for the payer's PayNow reference and amount, generates an SGQR where the payer is the payee, and the user scans it in their own bank app to send money back. Paybacks are recorded against the original payment.

## Capabilities

### New Capabilities

- `payee-configuration`: Per-user PayNow Payee reference setup and management via `/init` (mobile number or UEN, validation, persistence, updates).
- `payment-qr-issuance`: Guided creation of payment requests (description + amount), SGQR PayNow QR payload generation and image rendering delivered inline in Telegram, and sharing of the QR message.
- `payment-tracking`: Payment records with lifecycle statuses, user-facing listing/inspection, and manual marking of a payment as received; structured to accept automated receipt notifications later.
- `payback-qr`: Generating a payback SGQR (original payer becomes the payee) for a tracked payment and recording the payback.

### Modified Capabilities

None — this is the first change in the project; there are no existing specs.

## Impact

- New codebase/service: a Telegram bot application hosted on Cloudflare Workers — webhook transport via grammY, SGQR/EMVCo payload builder, pure-JS QR image rendering, D1 (serverless SQLite) persistence, and a per-chat Durable Object for conversation state.
- External dependencies: Telegram Bot API (webhook); Cloudflare platform (Workers, D1, Durable Objects, wrangler); SGQR (EMVCo-based) payload rules for PayNow proxy QRs; no bank or payment-network integration is required for v1.
- No existing code, APIs, or specs are affected.
