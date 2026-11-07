## ADDED Requirements

### Requirement: Payment QR message offers Received and Void actions

The system SHALL attach **✓ Received** and **✖ Void** buttons to the payment QR image message delivered by `/start`, and SHALL NOT offer a Payback action on it.

#### Scenario: Buttons on delivered QR

- **WHEN** a payment QR is delivered by `/start`
- **THEN** the image message carries ✓ Received and ✖ Void buttons bound to that payment and no Payback button
