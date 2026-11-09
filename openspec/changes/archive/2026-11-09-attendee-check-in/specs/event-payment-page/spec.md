## ADDED Requirements

### Requirement: Payer page reminds the payer to keep the QR

Wherever the payer page shows a payment QR (right after creating a request and when a pending request is opened from the history), it SHALL show the reminder "Keep this QR for event check-in and payment verification" next to the QR, as text.

#### Scenario: After creating a request

- **WHEN** a visitor creates a request and the QR is displayed
- **THEN** the reminder is shown with the QR

#### Scenario: Reopening a pending request

- **WHEN** a signed-in user opens a pending request's QR from the history
- **THEN** the reminder is shown with that QR
