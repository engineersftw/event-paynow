# Proposal

## Why

Checking in by QR needs the attendee to have their QR to hand. At a busy door some will not (lost it, phone dead, paid in person). The admin already has the search box on the event page, so finding the person by name and tapping a button on their row is the natural second way in.

## What Changes

- Each payment row on the web admin page that is pending or received and not yet checked in gets a **Check-In** button next to its other actions. One tap checks the attendee in; the row then shows the existing "Checked in" mark in place of the button.
- It uses the search and status filter already on the page (payer name or payment reference), so an admin types a name, sees the matching rows, and taps Check-In on the right one.
- Voided payments and rows already checked in show no button. A repeat tap, a race with another admin, or a voided payment is reported and the row refreshes to its true state.
- The check-in itself is unchanged: the same one-time guarded write, the same audit columns, the same admin and same-origin checks.
- The top-bar **Check-In** button keeps opening the camera scanner; it and the row button are two ways to the same check-in.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `web-admin`: adds checking in from a payment row.

## Impact

- `src/web/page.ts` only: a row button, its handler, and a small refactor so the scan dialog and the row share one check-in call. No API, schema or migration change (`POST /api/events/:ref/payments/:paymentRef/check-in` already exists).
- Tests: web-page tests on the rendered script; a Playwright check with stubbed API calls.
- README and AGENTS.md notes.
- Out of scope: undoing a check-in, a "not checked in" filter or a checked-in counter, a confirmation prompt, bulk check-in, and renaming the top-bar button.
