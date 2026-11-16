# Tasks

## 1. Data and shared helper

- [x] 1.1 Add `drizzle/0005_registrant_details.sql` (`events.form_fields`; `payments.payer_email`, `payments.answers`, all nullable text), update `src/db/schema.ts`, the `Event` and `Payment` types, both repositories (read, `EventPatch.formFields`, create-payment input) and the test schema in `test/workers/harness.ts`; verify with `npm run build`
- [x] 1.2 Add `src/commands/form-fields.ts`: parse and serialise the config (malformed = nothing asked), validate a custom label (1-30 characters, at most 3, unique ignoring case), email check, describe the config as text, and build the toggle keyboard for `/init` and `/edit_event`; verify with a node test covering each rule and malformed JSON

## 2. Bot setup

- [x] 2.1 `/edit_event`: add the Form fields choice (toggles that save at once, Add field by typed label, Remove per custom field, Done), admin re-check before each write, reply listing what is asked; verify with `npm run build`
- [x] 2.2 `/init`: add the Full name / Email switches to the confirmation message (in place, same step), list the choice in it and store it on Confirm; verify with `npm run build`
- [x] 2.3 Tests in `test/node/init-handler.test.ts` and the edit-event tests (and any wiring test that counts steps): toggles, add and remove, refusal of a fourth or repeated label, non-admin refused, stale buttons; verify the suites pass

## 3. Payment page

- [x] 3.1 In `src/web/handler.ts` make `GET /api/pay/:ref` return the fields the event asks for and `createPayerPayment` require and validate them (`missing_field` with the field, `invalid_email`, 80-character name when required), storing email and answers (label snapshot) with the payment; verify with `npm run build`
- [x] 3.2 In `src/web/page.ts` render the inputs from the response (required full name replaces the optional name field), show the field error, and add the "the organiser will see these details" line when anything is asked; verify with `npm run build`
- [x] 3.3 Workers tests: details stored, each missing field and a bad email refused with nothing created, an event with no fields unchanged, the list and history responses and QR caption contain neither email nor answers; node test that the page script parses; verify the suites pass

## 4. CSV export

- [x] 4.1 Add a repository method listing an event's payments for export (oldest first, capped at 5000) and `GET /api/events/:ref/export.csv` in `src/web/handler.ts` through `eventAccess`, with the BOM, CRLF, quoting, formula-safe cells, the column rules in design decision 5, a cap note row and `Content-Disposition: attachment`; verify with `npm run build`
- [x] 4.2 Add the Download CSV button to the event page (fetch with the existing wrapper, blob, temporary link); verify with `npm run build`
- [x] 4.3 Tests: admin gets the file with the right columns and rows, voided rows marked, no PayNow number, a member and an anonymous visitor are refused, a bearer session works, cells starting with `=`, `+`, `-`, `@` are neutralised, quotes and commas and newlines are escaped, an old answer survives a removed field; node test for the CSV writer; verify the suites pass

## 5. Docs and checks

- [x] 5.1 Update README (form fields, `/init` and `/edit_event`, CSV download, the new migration), AGENTS.md and `docs/architecture.md` (the data model, the payer API fields, the export route, the privacy rule)
- [x] 5.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report

## 6. Rollout

- [ ] 6.1 After deploy (the migration runs first), in a real chat: `/edit_event` switch Full name and Email on and add "Dietary needs", open the payment page and check each required field is enforced, pay as a registrant, confirm the event page list shows no email, download the CSV in a browser and in the Mini App on desktop and a phone, and open it in a spreadsheet (a value starting with `=` shows as text)

## Workflow follow-up

- Archive the change after 6.1 is confirmed on a real chat.
