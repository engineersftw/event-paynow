## Context

See proposal.md - Why. The page (`src/split-app/page.ts`) has one `busy` flag. `change()` sets it for the length of a request, and while it is set a second tap returns at once; `load()` (the first load, the poll every 4 seconds, and the reload after a refused change) also returns when it is set. Nothing on screen shows the flag, so a tap that is waiting and a tap that was ignored look the same. The interface answers a change only after it has edited the claim message in the chat, so a wait of a second or more is normal.

## Goals / Non-Goals

**Goals:**
- A visible sign, at once, for every wait the organiser causes, and for the first load.
- A second tap during the wait is visibly refused, not silently dropped.
- No flicker from the poll.

**Non-Goals:**
- Making the interface faster, optimistic updates, or any server change (see proposal).

## Decisions

**One header spinner, one `setBusy`.** The header becomes a row: the title on the left and `<div id="spin" class="spin" hidden>` (a small rotating ring and the text "Updating…") on the right. `setBusy(on)` sets the existing `busy` flag, shows or hides the spinner, and toggles a `busy` class and `aria-busy` on the item list. `change()` calls it around its request in a `finally`, so success, a refusal and a lost connection all clear it. The header row is sticky (it stays at the top of the screen with the page's background), so the spinner is in view however far the list is scrolled. Alternative: a spinner inside the tapped button: more precise, but the button is redrawn when the answer arrives, the controls differ (chip, form, select), and on a phone the organiser's thumb covers the button.

**The text stays.** "Updating…" is shown with the ring, not only a ring: it names what is happening, needs no extra work for screen readers (the element is a `role="status"`), and is what remains when the user prefers reduced motion (the ring stops turning).

**Dim and block, not just show.** While busy the list gets `opacity: .55; pointer-events: none`. A second tap then has nothing to land on, and the dimming explains why. The `busy` guard in `change()` stays for keyboard use.

**Loud and silent loads.** `load(loud)` takes a flag: the first load and the reload after a refused change pass `true` and use `setBusy`; the poll and the refresh on returning to the page pass nothing and neither show anything nor change `busy`. The poll still skips while a change is in flight, as now.

**No delay before showing.** The complaint is the missing sign, so the spinner appears with the tap. A very fast answer shows it for a moment; that is acceptable and easier to understand than a delayed one.

**The `hidden` attribute.** `.spin` sets `display: flex`, which overrides `hidden`; the stylesheet adds `.spin[hidden] { display: none }` (the same trap the admin page's `.me[hidden]` rule handles).

## Risks / Trade-offs

- A spinner does not shorten the wait → the proposal records the real cause (the interface waits for the chat edit) as a follow-up; with the spinner the wait no longer looks like a hang.
- Dimming the whole list for a one-item change is blunt → the wait is short, and a per-item state would need the item cards to survive redraws; not worth it here.
- The spinner could stay on if a request never settles → `fetch` on a dead connection rejects, which `change()` already catches; a request that hangs without an error keeps the page waiting exactly as it does today, now visibly.

## Migration Plan

Deploy the Worker; the page is served with `no-store`, so the next open uses it. Rollback: revert the commit.
