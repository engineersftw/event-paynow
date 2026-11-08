# Design

## Context

`renderPage` in `src/web/handler.ts` returns one HTML string: an inline `<style>`, a static shell and an inline script that fetches `/api/events/:ref` and builds the DOM with `textContent` (names are user input; a test forbids `innerHTML` and `<form>`). The Pages Function serves it, so there is no bundler. The endpoints, same-origin guard, audit columns and bot are untouched by this change.

## Goals / Non-Goals

**Goals:**
- A cleaner, mobile-first page that looks like shadcn/ui.
- Modal "New request" dialog; paybacks and pending-payment QR/actions hidden behind tap targets.
- No QR request on page load.

**Non-Goals:**
- Adopting React, Tailwind, Radix or the shadcn CLI; any build step or CDN dependency.
- New API fields, endpoints, migrations or bot changes.
- Changing totals, access control or attribution.

## Decisions

1. **shadcn look, not shadcn code.** shadcn/ui is React + Tailwind + Radix copied into a build. The page is a string served by a Function with a strict no-`innerHTML` test, so adopting it would add a bundler, a client framework and a new deploy step for a single page. Instead, port its design language: CSS variables for background/foreground/muted/border/primary/destructive/radius (light and dark via `prefers-color-scheme`), and small component classes (`.card`, `.badge`, `.btn` with `primary|outline|destructive|ghost`, `.input`, `.dialog`) in the existing `<style>`. Alternative considered: Preact + Tailwind build in `web/`; rejected as disproportionate. Revisit if the page grows into several views.
2. **Native `<dialog>` for the modal.** `showModal()` gives focus trapping, Escape, backdrop and `aria-modal` for free. Close on backdrop click by comparing the click target to the dialog. Error text sits in the dialog; values are kept because the dialog is only closed on success. After success the dialog switches to the result view (QR, details, posted / not posted line, "Done" and "Create another" buttons).
3. **Compact rows with disclosure buttons.** Each payment is a card row: payer name (or the reference when unnamed), amount (net below when paybacks exist), status badge, created time. Two optional `<button aria-expanded>` indicators: a pending badge-button on pending rows (reveals QR + Received / Void) and a "Paybacks · N" button on rows with paybacks or room to pay back (reveals payback rows, QRs of pending paybacks and the pay back form). Expansion state is kept in a `Set` of refs in script memory so a reload after an action keeps the row open; after creating a payback, its payment is added to the set so the QR shows.
4. **Lazy QR.** The `<img>` for a pending payment is created only when its panel opens, so no QR request is made on load. Pending payback QRs follow the same rule through the expanded panel.
5. **Table to cards.** A list of cards avoids horizontal scroll at phone width and avoids the nine-column table. Description is dropped (it is the event name in the header). Ref and received time move into the expanded details; totals become three stat cards.
6. **Accessibility.** Status uses text in the badge (not colour alone); indicators are real buttons with `aria-expanded`; focus rings from tokens; the dialog is labelled by its title.

## Risks / Trade-offs

- Hidden controls cost one extra tap for the common Received / Void action, as requested.
- Hand-rolled CSS can drift from real shadcn over time; acceptable for one page, and tokens keep it consistent.
- The inline script grows; the existing syntax-check test and DOM-only rule keep it safe. The test needs updating to the new strings.
- Visual quality cannot be asserted by unit tests; verify in a browser at phone and desktop widths, light and dark.
