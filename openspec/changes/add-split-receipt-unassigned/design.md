## Context

`parseAssignments` currently fails the whole message when an item is missing. The custom split already has the pattern we want: `nextNeed` returns a `LEFTOVER` step when the list falls short of the total, the user taps Split it evenly or Leave it out, and the choice is stored (`leftover`) and kept across amends. The receipt flow needs the same shape for items, and it must work with typed edits, Amend → Items, and the share maths.

## Goals / Non-Goals

**Goals:** accept partial assignments; ask the organiser; reuse the existing patterns; keep the amounts adding up to the receipt total.

**Non-Goals:** claiming by group members (separate change), covering by someone other than the organiser.

## Decisions

1. **`parseAssignments` returns the gaps.** The result gains `unassigned: number[]` (zero-based item indexes) instead of failing; the other checks (unknown number, item twice, line without people, too long names, too many people) still fail. The success value already holds `people` and `items`, where an unassigned item has an empty list.
2. **A pure helper applies the choice.** `applyUnassigned(assignment, choice)` returns a complete assignment: `'me'` adds the organiser (a `me` person is created if the message did not name them) to each unassigned item; `'even'` gives each unassigned item to all people named in the message (including `me` when named). `shareReceipt` is unchanged, because a complete assignment is what it already takes. The same helper will serve the claim change's unclaimed items.
3. **Context fields:** the typed assignment is parsed on every answer, and the parsed assignment (`people`, `items`) is stored as `partial` while a gap exists, together with `unassignedChoice` (`'even'` or `'me'`) once chosen and `gap` (the list of unassigned item indexes the choice was made for). When there is no gap, `entries` are computed straight away as today and `partial`, `unassignedChoice` and `gap` are removed.
4. **`readAnswer('assign')`:** parse; with no gap, behave as before. With a gap: if `unassignedChoice` exists and `gap` equals the new gap, compute `entries` now (keeping the choice, so an edited message just works); otherwise store `partial`, drop `entries` and `unassignedChoice`, and let `nextNeed` ask. The "nobody else owes anything" check runs on the completed assignment, so an incomplete message naming only `me` is still refused (it cannot produce collectable entries under either choice).
5. **New step `UNASSIGNED`.** `nextNeed` for a receipt without `entries` returns `UNASSIGNED` when `partial` exists with no `unassignedChoice`, otherwise `ASSIGN`. The prompt lists the unassigned items and their combined price (for example "Items 2 and 5 (SGD 18.00 before charges) were not given to anyone"), with buttons `split_unassigned:even` (Split evenly between those named) and `split_unassigned:me` (Leave them out: I cover them), plus Keep as is while amending. The callback applies the choice with `applyUnassigned`, runs `shareReceipt`/`toEntries`, sets `entries`, `leftover: 'omit'` and the choice, and calls `proceed`.
6. **Amend → Items** keeps `entries` and the stored choice until the new message arrives; step 4 decides whether the choice still applies.
7. **Wording and consistency** follow the custom split's leftover question (two buttons, "left out: you cover it") so users meet the same idea twice.
8. **Edge:** if the choice is `'even'` but the message named only `me`, entries are empty and the existing error appears; if everything unassigned goes to `me` and others have items, entries are the others' item shares plus their share of charges, as in any assignment.

## Risks / Trade-offs

- [Silent surprise when the gap changes after an edit] → the choice is reused only when the gap is identical; otherwise the bot asks again.
- [Existing tests expect the "has nobody" error] → they change to expect the question; error cases that remain are tested.
- [Overlap with `add-split-claim-items`] → the helper and wording are shared by design; no conflict in files except `split-handler.ts`, which that change extends later.

## Migration Plan

None: no data or configuration. A split in progress during the deploy simply lacks the new context fields.
