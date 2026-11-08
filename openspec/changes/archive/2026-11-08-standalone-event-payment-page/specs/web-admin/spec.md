# Spec Delta

## ADDED Requirements

### Requirement: Admin and payer event views have separate access policies
The system SHALL preserve the existing administrator-only event-management page while providing a separate payer-facing event page whose valid Telegram session is sufficient for payment creation.

#### Scenario: Admin page remains protected
- **WHEN** a signed-in non-admin requests the existing administrator event API or page
- **THEN** the request remains forbidden

#### Scenario: Payer page permits non-admin
- **WHEN** a signed-in non-admin requests the payer-facing page for a valid event
- **THEN** the payer page is available without returning administrator payment-management data

### Requirement: Payer-page QR creation does not post to Telegram
The payer-facing web flow SHALL show its created payment QR inline and SHALL not use the administrator page's Telegram posting behavior.

#### Scenario: Inline-only payer creation
- **WHEN** a payer creates a request through the payer-facing page
- **THEN** the QR is available through the page and no Telegram `sendPhoto` operation is attempted
