# Tasks

## 1. Page

- [x] 1.1 Extract the check-in POST from the scan dialog into a shared `checkInRequest(paymentRef)` and use it in both the dialog and the row handler, adding "Already checked in." and "This payment is voided." messages for the row. Verify the scan dialog still works with a Playwright check against stubbed API calls (scan, check in, repeat) and web-page tests on the rendered script.
- [x] 1.2 Add the **Check-In** button to `paymentCard` for non-voided, not-yet-checked-in rows (first in the strip, disabled while in flight, error text via `say()`, always `load()` afterwards). Verify with web-page tests (button markup and handler present, script parses) and a Playwright check: search for a name, tap Check-In, the row shows "Checked in" and no button; voided and already checked-in rows have none; a 409 `already_checked_in` and a 409 `voided` refresh the row and show their message; the search and filter survive the refresh.
- [x] 1.3 Check the row at 390 and 320 px, light and dark. Verify with the Playwright check: no sideways scroll, the button and the other toggles wrap cleanly.

## 2. Docs and checks

- [x] 2.1 Update README (check-in section: search and tap Check-In on a row) and AGENTS.md. Verify by reading the diff.
- [x] 2.2 Run `npm run check`, `npm run build` and `npm test`; all pass.
