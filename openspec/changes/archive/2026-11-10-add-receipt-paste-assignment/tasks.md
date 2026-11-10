## 1. Parser

- [x] 1.1 In `src/commands/receipt.ts` extract the name resolution (`me`, `all`, @mention, name length) from `parseAssignments` into a local helper, add the header-format branch that fills the same `lines` structure (current header, item lines by number, trailing colon, blank lines, comma groups, an item under several headers merged), and pick the branch by the detection rule in the design
- [x] 1.2 Add node tests in `test/node/receipt.test.ts`: the Sam / @benjamin / All example, a reworded and a price-less item line, an item under two headers, a header with no items, an item line before any header, an out-of-range number, mentions through `textMentions`, a trailing colon and `)` markers, the line format unchanged, and unassigned items from the header format

## 2. Conversation

- [x] 2.1 Update the assignment prompt in `src/commands/split-handler.ts` to show both formats (the item list goes in its own message just before the question)
- [x] 2.2 Add a Workers test in `test/workers/split-bot.test.ts`: a scan, a header format assignment, the resulting shares, and a bad message re-asking

## 3. Docs and checks

- [x] 3.1 Update the README receipt paragraph and `/help` text if it describes the format, `AGENTS.md` and `docs/architecture.md`
- [x] 3.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
