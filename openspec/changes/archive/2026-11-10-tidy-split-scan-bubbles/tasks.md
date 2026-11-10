## 1. Handler

- [x] 1.1 Put each review button on its own row in `reviewButtons` (`src/commands/split-handler.ts`)
- [x] 1.2 Keep the id of the "Reading your receipt…" message in the photo handler and delete it (error ignored) once the scan is parsed, just before the review is shown; leave it on every failure path
- [x] 1.3 Change the assignment prompt example to `All` and say the colon is optional

## 2. Tests and checks

- [x] 2.1 Node test in `test/node/receipt.test.ts`: `All`, `All:` and `ALL :` give the same assignment
- [x] 2.2 Workers tests in `test/workers/split-bot.test.ts`: the review has one button per row (with and without the missing-item button), the notice is deleted after a good scan and not after a failed one, and the prompt shows `All` without a colon
- [x] 2.3 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
