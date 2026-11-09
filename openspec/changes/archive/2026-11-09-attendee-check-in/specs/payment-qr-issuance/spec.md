## ADDED Requirements

### Requirement: Payment QR captions remind the payer to keep the QR

Every Telegram message that delivers a payment QR (from `/start`, from the web admin dialog's chat post, and from the payer page's private copy) SHALL include the reminder "Keep this QR for event check-in and payment verification" in its caption, after the payer segment and before the share hint, and SHALL not add PayNow numbers.

#### Scenario: Caption from /start

- **WHEN** a payment QR is created with `/start` for payer name Alice
- **THEN** the caption reads description, amount, reference, "Payer: Alice", the keep-the-QR reminder, then the share hint

#### Scenario: Caption without a payer name

- **WHEN** the payment has no payer name
- **THEN** the caption has no payer segment and still contains the reminder before the share hint

#### Scenario: Other delivery paths

- **WHEN** the QR is posted to the event chat from the web admin dialog or sent as the payer's private copy
- **THEN** its caption contains the same reminder

#### Scenario: Paybacks unaffected

- **WHEN** a payback QR is sent
- **THEN** its caption does not contain the reminder
