# Spec Delta

## Purpose

Lets each Telegram user register and manage their own PayNow Payee reference (SG mobile number or UEN) so the bot can generate QR codes that route payments to that user's account.

## ADDED Requirements

### Requirement: User registers a Payee reference via /init

The system SHALL prompt a user who runs `/init` to provide their PayNow Payee reference and SHALL accept only an SG mobile number (pattern `+65` followed by 8 digits starting with 6, 8, or 9, or an 8-digit local number) or a valid-format UEN (9, 10, 12, or 13 alphanumeric characters).

#### Scenario: First-time setup with mobile number

- **WHEN** a user with no stored Payee reference runs `/init` and submits an SG mobile number
- **THEN** the system validates the format, saves it as that user's Payee reference, and confirms the setup with the stored value

#### Scenario: First-time setup with UEN

- **WHEN** a user with no stored Payee reference runs `/init` and submits a UEN
- **THEN** the system validates the format, saves it as that user's Payee reference, and confirms the setup

#### Scenario: Invalid reference rejected

- **WHEN** a user submits a value that is neither a valid SG mobile number format nor a valid UEN format
- **THEN** the system rejects the input with an explanatory error and retains the previous stored reference (if any)

### Requirement: Payee reference is stored per user

The system SHALL store the Payee reference keyed by the Telegram user identity, isolated from other users, and SHALL treat a user with no stored reference as unconfigured.

#### Scenario: Unconfigured user creates a payment

- **WHEN** a user without a stored Payee reference requests a payment QR
- **THEN** the system declines to generate a QR and prompts the user to run `/init` first

### Requirement: Payee reference can be updated

The system SHALL allow a configured user to run `/init` again to replace their stored Payee reference, and newly generated QRs SHALL use the current value.

#### Scenario: Update existing reference

- **WHEN** a user with a stored Payee reference runs `/init` and submits a new valid reference
- **THEN** the system replaces the stored value and confirms the update
