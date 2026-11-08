# Spec Delta

## ADDED Requirements

### Requirement: Web payer requests use the event snapshot
Payment requests created from the payer-facing event page SHALL be linked to the selected event, use its current payee and name at creation time, and retain the signed-in creator as the payment owner.

#### Scenario: Event-linked request
- **WHEN** a payer submits a valid request for event `E`
- **THEN** the payment stores `E` as its event, snapshots `E`'s payee and name, and stores the authenticated payer-page user as owner

### Requirement: Payer-page requests use pending payment semantics
A valid payer-page submission SHALL create the same kind of pending payment request as the existing manual payment flow, without changing receipt or void behavior.

#### Scenario: Pending after creation
- **WHEN** a payer successfully creates a request
- **THEN** its status is `pending`, its amount is fixed in the SGQR payload, and it can later be settled through existing payment-management actions
