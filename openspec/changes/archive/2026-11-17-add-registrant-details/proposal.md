# Proposal

## Why

Organisers who sell places through the event payment page learn only a payer's PayNow number and an optional name. They cannot ask for an email, a full name or anything event-specific (dietary needs, company), and they cannot get the registrants out of the system for a guest list or a mailing.

## What Changes

- An event can ask payers for more details on the web payment page: **Full name** and **Email** (each switched on or off), plus up to three organiser-written text fields (for example "Dietary needs"). A switched-on field is required.
- The organiser sets this in the bot: `/edit_event` gets a **Form fields** choice (toggle Full name and Email, add or remove custom fields), and `/init` shows the two switches on its confirmation message. Custom fields are added with `/edit_event`.
- The payment page shows the chosen fields and refuses a request that leaves one empty or invalid. With none switched on it is exactly as today (the name stays optional).
- The details are stored with the payment. They are never shown in the payments list, QR captions, chat messages or the payer's history: only the CSV export returns them.
- The event page in the Web Admin (browser and Mini App) gets a **Download CSV** button, for chat admins only, listing every payment of the event with its details.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `event-management`: an event stores which details its payment page asks for, set in `/init` (Full name, Email) and `/edit_event` (also custom fields).
- `event-payment-page`: the page asks the chosen details, validates them and keeps them private.
- `web-admin`: admins can download the event's registrants as a CSV file.

## Impact

- Database: migration `0005` adds `events.form_fields` and `payments.payer_email` and `payments.answers`, all nullable, so it is backward compatible with the running Worker.
- Code: `src/db/` (schema, types, repositories), `src/commands/` (`init-handler.ts`, `edit-event-handler.ts`, a shared form-field helper), `src/payments/payment-request.ts`, `src/web/handler.ts` and `page.ts` (payer form, export route, button), test harness schema.
- Personal data: email and typed answers are new personal data in D1, readable only through the admin CSV. No new secret or dependency. The bot's `/start` flow is unchanged.
