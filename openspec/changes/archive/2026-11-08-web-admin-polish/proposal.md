# Proposal

## Why

After the redesign, the admin page works but is still anonymous and hard to scan: the title is just the event name, status pills look alike, the payback count and row buttons are easy to miss, dates are long locale strings, and the theme cannot be chosen.

## What Changes

- Header reads `Event: <Event Name>` and the bot logo (the red calendar with a green dollar sign, supplied by the user as `images/3.webp`) on a transparent background sits at the top left; it also serves as the page icon.
- A manual light / dark toggle in the header. It overrides the system preference, is remembered in the browser, and defaults to the system preference.
- Status pills get distinct background colours: pending amber, received green, voided grey (cancelled / sent paybacks follow the same scheme). The text label stays.
- The payback count becomes a prominent count chip on the "Paybacks" button.
- Per-row buttons (the pending QR toggle, the payback toggle, Received / Void, Sent / Cancel, Pay back) become larger, with a bigger tap target and clearer styling.
- Dates are shown as `dd-MMM-YYYY` (for example `08-Nov-2026`), date only.
- No API, database or bot change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `web-admin`: adds requirements for the header and logo, the theme toggle, status colours, the payback count, row action size and the date format.

## Impact

- `src/web/page.ts` (CSS and client script), `test/node/web-page.test.ts`, `test/workers/web-admin.test.ts` if markup strings change.
- New static asset `web/public/logo.png` (the supplied image, cropped to the icon, kept on a fully transparent background and resized to about 128px), served by Pages before the catch-all Function.
- `AGENTS.md` web admin sentence.
