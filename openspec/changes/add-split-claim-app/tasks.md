# Tasks

## 1. Check the launch path and add the configuration

- [x] 1.1 In BotFather make a throwaway Mini App for the Split bot (any page URL) and open `https://t.me/<bot>/<short_name>?startapp=-100123_0` from a `url` button in a real group; confirm it opens, the page receives `start_param`, and a `web_app` button is refused in the group. If it does not work, stop and revisit design.md before any code
- [x] 1.2 Add `SPLIT_APP_NAME?: string` to `src/env.ts` and `SPLIT_APP_NAME = ""` (commented, with the BotFather steps) to `wrangler.toml`; verify with `npm run build`

## 2. Share the claim logic (no behaviour change)

- [x] 2.1 Create `src/commands/split-claims.ts` and move into it `applyClaim` and its types, `claimText`, `claimButtons`, the accessors (`claimsOf`, `claimersOf`, `servedOf`, `waysOf`, `itemLocked`) and the `mutateClaims` loop as `mutateClaimsOn(stub, change, expectMsg?)` taking the Durable Object stub instead of a grammY `Context`; verify `npm run build` passes
- [x] 2.2 Make `SplitCommandHandler.mutateClaims` call `mutateClaimsOn`; verify the whole existing suite (`npm test`) passes unchanged, with no test edited except imports

## 3. Verify Telegram's launch data

- [x] 3.1 Add `src/split-app/init-data.ts`: `verifyInitData(initData, botToken, nowSec)` with Web Crypto (no Node APIs, no import from `src/web/`), returning `{ user, startParam, authDate }` or null; reject a wrong hash, a missing field, an `auth_date` older than 24 hours or in the future, and a malformed `user`
- [x] 3.2 Tests in `test/node/split-app-init-data.test.ts` with a signing helper: valid, wrong token, tampered field, expired, future date, missing `user`, extra fields kept in the signature; verify they pass

## 4. The API

- [x] 4.1 Add `src/split-app/api.ts`: `handleSplitApp(request, env)` for `GET /split-app/api/state` and `POST /split-app/api/claim`, reading `Authorization: tma <initData>`, taking the chat from `start_param`, and authorising with `/peek` (flow `split`, step CLAIM, `owner.userId` equals the user); 403 for others, 409 `over` when no claiming is active, 404 when not configured
- [x] 4.2 `state` returns items (name, cents, holders, ways, locked), people (id, name, served) and the organiser id; `claim` takes `{ item, op }` for `mine`, `toggle` (person id), `add` (typed text), `clear` and `ways` (number or null), runs `applyClaim` through `mutateClaimsOn`, and answers the new state or a short refusal text (422)
- [x] 4.3 After a successful claim, edit the chat's claim message with a plain grammY `Api` (errors ignored); route `/split-app` and `/split-app/api/*` in `src/worker.ts`, 404 until `SPLIT_APP_NAME` and `SPLIT_BOT_TOKEN` are set
- [x] 4.4 Tests in `test/workers/split-app-api.test.ts` (real Durable Object, Telegram stub): organiser reads the state; member, stranger, wrong chat and forged data refused; each op; N-way limits and the 20-person and 20-character limits; locked items and people with a QR refused; two edits and a chat tap at once all kept; claim message edited; no claiming, Done and cancel give `over`; unconfigured gives 404; nothing in the Durable Object changes after a refused call

## 5. The button

- [x] 5.1 In `claimButtons` add the Edit in app `url` button when `SPLIT_APP_NAME` and the bot username are known, with `startapp=<chatId>_<topicId>`; pass the config from the handler's dependencies so the function stays pure
- [x] 5.2 Tests: the claim message has the button when configured and not otherwise, the link carries the right chat and topic, and the existing claim-message tests still pass

## 6. The page

- [x] 6.1 Add `src/split-app/page.ts` and serve it at `GET /split-app` with the Content-Security-Policy: items as cards with holder chips (tap to remove) and a person picker, an add-by-name field, a ways control and Remove all, locked items marked, "only the organiser" and "claiming is over" states, a 4-second poll while visible, Telegram theme colours, `ready()` and `expand()`; all text set with `textContent`
- [x] 6.2 Tests: the page is 200 HTML with the CSP and the `telegram.org` script; its inline script parses (`new Function`) and contains no `innerHTML`; verify they pass
- [x] 6.3 Open the page in Playwright against a local `wrangler dev` with a signed launch data and a seeded claim state: items render, a chip tap and an add-by-name change the state, an item with a hostile name (`<img src=x onerror=alert(1)>`) renders as text, and the layout is usable at 320 px wide; keep the script out of the repository

## 7. Docs and rollout

- [x] 7.1 Update README (the Mini App, the BotFather `/newapp` steps with the 640x360 picture, `SPLIT_APP_NAME`, project structure), AGENTS.md (the new files, the claim logic's new home, the deploy-filter note), `docs/architecture.md`, and the `/split` landing page text and its test (what the app is, and that it stores nothing); verify the landing test passes
- [x] 7.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
- [ ] 7.3 Deploy, create the Mini App in BotFather, set `SPLIT_APP_NAME`, and in a real group run one claim split: a member claims, the organiser edits in the app (toggle, add by name, share 3 ways, remove all), Done in the chat still works, and a member opening the app is told it is for the organiser

## 8. Changes from the first live run

- [x] 8.1 Add the `everyone` change to the interface (`op: 'everyone'`: people not holding the item and not served, refused as a whole when fewer shares are left or nobody is left to add) and test each case in `test/workers/split-app-api.test.ts`
- [x] 8.2 In the page: empty an item's name field after a successful add (keep it after a refusal), add `+ Everyone`, and show the ways dropdown only for an item that already has ways or after `Share with more people…`, with how many shares are left; verify in Chromium (field cleared, Everyone adds all, dropdown hidden then shown, still no sideways scroll at 320 px)
- [x] 8.3 Update the script test, README and the architecture note if they name the changed behaviour; run `npm run build`, `npm run check` and `npm test`

## Workflow follow-up

- Archive the change after 7.3 is confirmed on a real group.
