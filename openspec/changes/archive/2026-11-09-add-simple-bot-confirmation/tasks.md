# Tasks

## 1. Confirmation step

- [x] 1.1 In `src/commands/simple-handler.ts` add step CONFIRM(5): store the description (or none) in the state and show the summary (payee type and number, amount or "set by payer", change-amount choice only with an amount, description or "none") with Confirm / Cancel buttons instead of generating the QR
- [x] 1.2 Handle `simple_confirm` (step-guarded; remove the summary's buttons, then `finish()` claiming step CONFIRM, reading the description from the claimed state) and `simple_cancel` (reset, "Nothing was created" message); text at this step gets the "tap Confirm or Cancel" reminder

## 2. Tests

- [x] 2.1 Update `test/workers/simple-bot.test.ts`: every flow now taps Confirm before the QR; the summary shows each answer and no photo is sent before Confirm; summary without an amount; Cancel generates nothing and clears the state; text at the summary changes nothing; double Confirm gives one QR; the caption and image still lack the payee number

## 3. Docs and verification

- [x] 3.1 Update `README.md`, `docs/architecture.md` and `AGENTS.md` (the simple bot flow now ends in a confirmation)
- [x] 3.2 Run `npm run check`, `npm run build` and the full test suite
