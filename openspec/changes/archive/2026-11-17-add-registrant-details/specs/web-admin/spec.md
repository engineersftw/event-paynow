## ADDED Requirements

### Requirement: Admins can download the event's registrants as CSV

The system SHALL let a chat admin of an event download a CSV file with one row per payment of that event, voided ones included and marked: reference, created time, status, amount, name, email, one column per custom field, and the check-in time. It SHALL never include a PayNow number. It SHALL answer only signed-in chat admins, keep the details of payments made before a field was removed or switched off, and leave the payments list and payer messages unchanged.

#### Scenario: Admin downloads

- **WHEN** a signed-in chat admin chooses Download CSV on the event page
- **THEN** a CSV file for that event is saved, with a header row and a row per payment

#### Scenario: Not an admin

- **WHEN** a signed-in user who is not an admin, or a visitor who is not signed in, requests the export
- **THEN** the system refuses and returns no data

#### Scenario: Spreadsheet formulas

- **WHEN** a registrant typed a value starting with `=`, `+`, `-` or `@`
- **THEN** the file stores it so a spreadsheet shows it as text and does not run it

#### Scenario: Works in the Mini App

- **WHEN** an admin uses Download CSV inside the Telegram Mini App
- **THEN** the same file is offered, using the session the page already holds
