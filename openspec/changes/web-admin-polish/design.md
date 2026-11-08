# Design

## Context

`src/web/page.ts` holds the whole page (CSS tokens, DOM-building script). Dark mode is a `prefers-color-scheme` media query on the `:root` tokens. Pages serves files in `web/public/` before the catch-all Function, so a logo placed there needs no route.

## Goals / Non-Goals

**Goals:** the seven polish items; keep the no-`innerHTML`, no-`<form>` rules and the single-file page.

**Non-Goals:** API, bot or database changes; time-zone settings; localisation of month names.

## Decisions

1. **Theme toggle with `data-theme`.** Tokens move to `:root` (light), `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`. A tiny inline script in `<head>` sets `data-theme` from `localStorage` before paint (try/catch, so a blocked storage falls back to the system theme). The toggle button flips the attribute and saves it; it shows only an icon (☀ or ☾), no words, with an `aria-label` for screen readers.
2. **Logo as a static asset.** The supplied webp (`images/3.webp`, 1254px) already has a transparent background and a tight icon (no stray marks). Crop it to the icon with a little padding, make sure alpha stays clean outside the icon, resize to 128px and commit as `web/public/logo.png`, used in the header `<img>` (with `alt`, fixed width/height so layout does not jump) and as `<link rel="icon">`. If it fails, `alt` text and the title remain. Alternative of embedding base64 in `page.ts` rejected: bloats every page load and the Function.
3. **Header text.** `h1` becomes `Event: ` plus the name, set with `textContent`; `document.title` the same. Before the data loads it shows "Event".
4. **Status colours via tokens.** `--pending`, `--received`, `--voided` background/foreground pairs for both themes (amber, green, grey) applied by `.badge.<status>`; paybacks reuse them (`sent` = received colours, `cancelled` = voided colours). Text remains in the pill so colour is not the only cue.
5. **Payback count chip.** The button label is built as text plus a `<span class="count">N</span>` styled as a filled round chip.
6. **Bigger buttons.** `.btn` becomes `min-height:40px` with larger padding and font weight; the row toggles stop using the small variant. Primary (Received, Sent, Pay back) and destructive (Void, Cancel) stay visually distinct.
7. **Dates.** One `fmtDate(t)` helper: `String(day).padStart(2,'0') + '-' + MONTHS[month] + '-' + year` using the browser's local time zone, with a fixed English month array (not `toLocaleString`, so the format is identical everywhere). Used for created and received dates; times are dropped.

## Risks / Trade-offs

- Local time zone means a payment created near midnight can show the neighbouring date for viewers in another zone; acceptable for a date-only display.
- Hand-picked colours need a contrast check in both themes; verify in a browser.
- A saved theme is per browser, not per account.
