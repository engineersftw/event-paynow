# Tasks

## 1. /web_admin buttons

- [x] 1.1 In `src/commands/web-admin-handler.ts` drop the Pay button (rows are event button plus 🌐 with the Mini App, the event button alone without it); verify with `npm run build`
- [x] 1.2 Update `test/node/web-admin-handler.test.ts` and `test/workers/bot-wiring.test.ts` to the new rows and assert no button links to `/pay/`; verify the suites pass

## 2. Docs and checks

- [x] 2.1 Update README (`/web_admin` description and the Mini App setup note), `docs/architecture.md` and AGENTS.md where they say `/web_admin` has a Pay button; verify with a search for the old wording
- [x] 2.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report

## 3. Rollout

- [ ] 3.1 After deploy, send `/web_admin` on a phone: each event row shows the event button and 🌐 only, with the name readable, and `/web_payment` still lists the payer links

## Workflow follow-up

- Archive the change after 3.1 is confirmed.
