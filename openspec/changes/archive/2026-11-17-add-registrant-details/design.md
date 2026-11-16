# Design

## Context

The payer page `/pay/<ref>` posts `{ payer, name, amount }` to `createPayerPayment`, which stores `payer_name` (40 characters, optional) through `createPaymentRequest`. Event settings (name, payee, default amount, website) are `events` columns set by `/init` and changed by `/edit_event` (`updateEvent`, open events, admins). The event page lists payments through `paymentViews`, which returns names only. D1 migrations run before deploys, so they must be backward compatible; the test schema in `test/workers/harness.ts` mirrors them. See proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- Organisers choose Full name and Email and up to three custom text fields; the payer page asks them and validates them.
- Admins download everything as CSV from the Web Admin, in the browser and the Mini App.
- Registrant details are readable only through that export.

**Non-Goals:**
- Asking the details in the bot's `/start`, or in the admin's "New request" dialog.
- Optional custom fields, field types (choice, number, date), reordering, or editing answers after payment.
- Deleting or expiring the details, or a way to export from the bot.
- Configuring fields on the web (done in the bot, same as every event setting).

## Decisions

1. **Event config is one JSON column.** `events.form_fields` holds `{"name":bool,"email":bool,"custom":["Dietary needs",...]}` (null = nothing asked). A small module `src/commands/form-fields.ts` parses it (anything malformed reads as nothing asked), validates a custom label (1 to 30 characters, at most 3, unique ignoring case), and builds the toggle keyboard both `/init` and `/edit_event` use. Alternative: a table per field. Rejected: at most five fields per event, never queried by field.
2. **Answers are columns on the payment.** `payments.payer_email` (text) and `payments.answers` (JSON array of `{label, value}`, the label copied when the payment is made, like the payee snapshot, so renaming or removing a field later does not break old rows). The full name reuses `payer_name`, so every place that already shows a name keeps working; the server accepts up to 80 characters when the event requires it (40 otherwise, as now).
3. **Required means required.** Every switched-on field must be present. Email is checked with a simple `local@domain.tld` pattern with no spaces, 120 characters at most. Errors are `{ error: 'missing_field', field }` or `invalid_email`, and the page shows the message next to the field. The server decides what is asked from the event, never from the request.
4. **Private by omission.** `paymentViews`, `payerHistory`, captions and DMs are not changed and never select the new columns into their output. Only the export reads them. A test asserts that the list response contains neither value.
5. **CSV export.** `GET /api/events/:ref/export.csv` goes through `eventAccess` (session or bearer, live admin check). It reads all payments of the event (a new repository method, oldest first (registration order), capped at 5000 rows; above that the file ends with a note row rather than silently cutting) and writes UTF-8 with a byte order mark (Excel), CRLF line ends and quoted cells. Columns: Reference, Created, Status, Amount (SGD), Name, Email, one per custom label, Checked in. Email and custom columns appear when the event asks for them now or any row has a value, so older answers are never dropped. No PayNow number. A cell starting with `=`, `+`, `-`, `@`, tab or carriage return gets a leading `'` so a spreadsheet shows text instead of running a formula; this is the one place user-typed text meets a formula-capable program.
6. **Download button.** "Download CSV" on the event page fetches the file with the page's existing request wrapper (so the Mini App's bearer session works), turns it into a blob and clicks a temporary link. Telegram's web view may not save blob downloads on every client; the 🌐 browser button is the fallback, and the live check covers it.
7. **Bot setup.** `/edit_event` gets a fifth choice, Form fields: a keyboard with Full name and Email toggles (each tap saves at once), Add field (the next typed message is the label), Remove buttons for each custom field, and Done. `/init` shows the two toggles above Confirm / Cancel on its existing confirmation (a tap updates the message in place and stays on that step; the confirmation lists what will be asked), so no step is added. Custom fields are added with `/edit_event` after the event exists.

## Risks / Trade-offs

- **Personal data.** Emails and answers sit in D1 until the payment is removed, and the CSV leaves the system when an admin downloads it. The page tells payers the organiser will see what they give; there is no retention job (a non-goal, named so it is a decision and not an oversight).
- **Unreachable payers.** Required fields add friction for anonymous payers; an organiser who asks too much loses sign-ups. Left to the organiser.
- **Mini App downloads.** May not save on some Telegram clients (see decision 6).
- **Free-text answers are untrusted.** Everywhere they are written to the page (nowhere, apart from the CSV) they would use `textContent`; the CSV protects against formula injection. They never reach a Markdown or HTML message.
- **Migration.** Three nullable columns, added with `ALTER TABLE` (the CHECK-constraint rebuild rule does not apply); old rows and the running Worker are unaffected.
