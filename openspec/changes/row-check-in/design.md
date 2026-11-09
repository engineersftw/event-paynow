# Design

## Context

The check-in write already exists end to end: `POST /api/events/:ref/payments/:paymentRef/check-in` (admin-only, same-origin, one guarded `UPDATE`, 409 `already_checked_in` with the first time or 409 `voided`), the payment JSON already carries `checkedInAt`, and rows already show a "Checked in" badge. The event page (`src/web/page.ts`) renders each row with `paymentCard(p)`, whose `.toggles` strip holds "Show QR and actions" (pending) and "Pay back / Paybacks" (received). The scan dialog has its own `checkIn(button)` that posts to that route and then refreshes the dialog and the list. Search (payer name or reference) and the status filter already exist. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- A one-tap row action with no API change, reusing the same check-in call as the scan dialog.

**Non-Goals:**
- Undo, a confirmation step, a "not checked in" filter or counter, bulk check-in, renaming the top-bar button.

## Decisions

1. **Button placement:** `paymentCard` adds a primary **Check-In** button to the `.toggles` strip, first in the strip, when `p.status !== 'voided'` and `!p.checkedInAt`. Rows that are voided or checked in render no button, so the strip and the row height are unchanged for them. Alternative: put it in the row's right-hand column next to the badges, rejected because that column is already tight on 320 px screens.
2. **One shared call:** extract `checkInRequest(paymentRef)` (the POST and its result handling) from the scan dialog's `checkIn`. Both callers use it. It returns `{ ok, error, checkedInAt }`; the row handler shows the error text with the existing `say()` (reusing `failure()` plus two new texts, "Already checked in." and "This payment is voided."), then calls `load()` so the row refreshes to its real state whatever happened. The dialog keeps its own messages.
3. **No confirmation, no undo.** A tap checks in, as asked, which keeps the door fast. The cost is that a wrong tap in a dense list cannot be reverted in the app, so the button is a full-height 40px target away from other controls in the strip and the "Checked in" mark appears at once for feedback. An undo is listed as a follow-up.
4. **Double taps:** the button is disabled while its request is in flight, and the server's guarded write makes a second tap harmless.
5. **Search and filter:** unchanged; `load()` already refetches at least the rows on screen with the active search and status, so the refresh keeps them.
6. **Two Check-In buttons.** The top-bar Check-In (camera) and the row Check-In (direct) share a name. The page keeps the top-bar label the user chose; the row button sits inside a row with the attendee's name, which makes its meaning clear.

## Risks / Trade-offs

- Wrong-person check-in cannot be undone → name, reference and amount are shown on the row above the button; follow-up undo.
- Two buttons named Check-In may confuse → different places (header vs row); rename the header to "Scan" if users trip on it.
- The strip grows by one button on narrow screens → the strip already wraps; verified at 320 px in the Playwright check.
