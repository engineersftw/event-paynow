# Spec Delta

## ADDED Requirements

### Requirement: The new-request dialog pre-fills the event's default amount

The system SHALL return the event's default amount (when set) with the event data, and the new payment request dialog SHALL pre-fill the amount field with it, in the same format the admin would type (such as `21.00`). The admin SHALL be able to change it, and an event without a default amount SHALL show an empty field. The default SHALL NOT be applied by the server when the request carries an amount.

#### Scenario: Pre-filled amount

- **WHEN** the admin opens the dialog for an event with a default amount of 2100 cents
- **THEN** the amount field shows 21.00

#### Scenario: Changed amount

- **WHEN** the admin changes it to 15.00 and submits
- **THEN** the request is created for 15.00

#### Scenario: No default

- **WHEN** the event has no default amount
- **THEN** the amount field is empty

#### Scenario: Create another

- **WHEN** the admin taps "Create another" after creating a request
- **THEN** the amount field shows the default again
