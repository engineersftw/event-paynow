# Design

## Context

`createPaymentRequest` (`src/payments/payment-request.ts`, used by `/start`, the payer page and the admin page) calls `buildPayNowPayload` with `reference: ref` (written to 26.05) and `description: event.name` (written to 62.01, cut to 25 printable ASCII characters). The bank app in the user's screenshot shows 62.01 as the chip under the amount ("Birthday Party") and shows no reference. See proposal.md - Why.

## Goals / Non-Goals

**Goals:** the payment reference is visible to the payee in the bank app and statement, with the least change.

**Non-Goals:** changing the payback, Simple or Split QRs; adding the reference label (62.05) or other optional fields; showing the reference anywhere else; re-issuing existing QRs.

## Decisions

1. **Reference first in 62.01.** `description` becomes `truncateAnsi(`${ref} ${event.name}`, 25).trim()`. The reference is 10 characters, so the event name gets 14. Reference first means truncation only ever shortens the name. The `payments.description` column and the caption and image text keep the full event name; only the QR payload changes. Chosen with the owner over reference-only, which would drop the event name from the payer's screen.
2. **Keep 26.05.** The check-in scan reads the reference from there (`paymentReferenceFromPayload`) and compares the stored payload, so it is untouched.
3. **One place.** The expression lives in `createPaymentRequest`, so `/start`, the payer page and the admin page change together. `buildPayNowPayload` is not changed, because the Simple, Split and payback QRs use it with their own descriptions.
4. **No 62.05.** The Reference Label field would also be standard, but bank support for showing it varies and nothing here shows it works; 62.01 is the field the user's bank displays, which the screenshot confirms.

## Risks / Trade-offs

- **Other banks may show 62.01 differently** (some show it as "reference", some in the statement only). The live check uses the one bank app available; the field is the standard bill number, so the risk is a different label, not a rejected QR.
- **The payer sees a code before the name** (`K7M2QX4TNB Birthday Party`). That is the intent; the name is shortened to 14 characters.
- **Non-ASCII event names** lose those characters in the QR (already true today); the caption and image keep the full name.
