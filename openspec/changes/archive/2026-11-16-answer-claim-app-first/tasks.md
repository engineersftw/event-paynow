# Tasks

## 1. Answer first

- [x] 1.1 In `src/split-app/api.ts` add `waitUntil?` to `SplitAppDeps` and make `refreshClaimMessage` the background refresh: read the conversation with `/peek`, return when the flow is not `split` at CLAIM or there is no claim message, edit from that state, read again and repeat while `rev` changed, at most 3 rounds, errors ignored; the claim route hands it to `waitUntil` and answers at once, or awaits it when `waitUntil` is absent; verify with `npm run build` and `npx vitest run test/workers/split-app-api.test.ts` (the existing tests pass through the fallback)
- [x] 1.2 In `src/worker.ts` pass `(p) => ctx.waitUntil(p)` to the Mini App interface; verify with a Worker-route test that a change through `worker.fetch` calls `ctx.waitUntil`
- [x] 1.3 Tests in `test/workers/split-app-api.test.ts` with a gated fake Telegram and a collecting `waitUntil`: the answer arrives while the edit is still held; after the gate opens the chat shows the new claims; two quick changes end with both shown; a member's chat tap during the refresh ends up shown too; an earlier edit finishing after a later one is corrected; no edit starts after Done or a cancel; a failed edit leaves the answer unaffected; verify the file passes

## 2. Docs and checks

- [x] 2.1 Update `docs/architecture.md` where the interface's chat refresh is described (answered first, refreshed afterwards from the newest state, skipped once closed); verify with a search for the sentence
- [x] 2.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report

## 3. Rollout

- [x] 3.1 Deploy, then in a real group tap Add on a name in the app: the app updates faster than before, the claim message in the chat shows the change a moment later, and several quick changes all appear in the chat

## Workflow follow-up

- Archive the change after 3.1 is confirmed on a real group.
