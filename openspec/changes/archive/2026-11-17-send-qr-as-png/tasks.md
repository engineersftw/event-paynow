# Tasks

## 1. Bots

- [x] 1.1 In `start-handler.ts`, `payback-handler.ts` and `simple-handler.ts` replace the BMP render and upload with `qrPhoto` (PNG file), dropping the unused imports; verify with `npm run build`
- [x] 1.2 Update the tests that assert the uploaded file name (`start-flow`, `simple-bot`, `payback-qr`, and any other the full run reports) to `.png`; verify the QR still decodes with the existing harness check

## 2. Web pages

- [x] 2.1 In `src/web/handler.ts` pass the PNG it already makes to `postPaymentQr` and `sendPaymentDm`, and in `src/web/telegram.ts` upload it as `image/png` named `paynow-qr.png` (parameter `png`); verify with `npm run build`
- [x] 2.2 Update `test/node/web-telegram.test.ts` and the web tests that check the posted photo; verify the suites pass

## 3. Docs and checks

- [x] 3.1 Update README, AGENTS.md and `docs/architecture.md` where they say Telegram receives the BMP (including AGENTS.md "Telegram keeps the BMP"); verify with a search for the old wording
- [x] 3.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report

## 4. Rollout

- [x] 4.1 After deploy, in a real chat: create a payment with `/start`, a payback, a Simple bot QR, and a payment from the web payer page signed in (the direct message) and from the admin page (the chat post); each QR arrives as a photo and scans in a banking app

## Workflow follow-up

- Archive the change after 4.1 is confirmed on a real chat.
