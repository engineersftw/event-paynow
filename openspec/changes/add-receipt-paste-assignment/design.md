## Context

`parseAssignments(text, itemCount, textMentions)` in `src/commands/receipt.ts` turns the message into `{ people, items, unassigned }`. Its inner loop reads each line as item numbers then names, producing `lines: { items, who }[]`; sharing, the `all` rule, validation and the result are built from those lines. Everything after the loop is format-independent.

## Decisions

**Parse the header format into the same `lines` shape.** A new branch walks the message, keeps the current header's people, and for each item line pushes `{ items: [n], who: current }`. The existing code after the loop is reused unchanged, so `me`, `all`, mentions, name length, the people cap and unassigned handling behave identically. The only difference is the duplicate rule: the line format rejects an item assigned twice; the header format merges the people, because pasting a list and repeating an item under two names is a natural way to say "shared".

**Format detection.** An item line matches `^\d+[.)]\s`. A line format line (`1,3 Ann`, `2 Ann, Bob`) never has a full stop or bracket right after the number. If every non-blank line is a line format line the old parser runs; otherwise (any header line, or any `N.` item line) the header parser runs. This keeps all existing messages working and gives a bad old-style line the same error as before.

**Header parsing reuses the name rules.** A header is the line with an optional trailing `:` removed, split on commas, each part `me`, `all`, an @mention or a name, resolved by the same code as today (extracted into a small local helper shared by both branches). Mentions keep working through `textMentions`, keyed by the entity text.

**Item lines match by number only.** The text after the number is ignored, so pasted lists can be edited freely. An item number out of range is an error naming it.

**Headers with no items.** They still add the person to `people`, so `All` includes them. This matches the example, where Sam and Benjamin both have their own items, and costs nothing otherwise.

## Risks

- A person whose name is a number or begins `1.` would be misread. Accepted: names are text and the line format already has this limit.
- Sending only item lines with no headers is an error with a hint, not a silent "everything unassigned".
