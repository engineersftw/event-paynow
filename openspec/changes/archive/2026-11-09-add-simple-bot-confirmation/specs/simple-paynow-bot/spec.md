## MODIFIED Requirements

### Requirement: The bot asks for payee, amount and description

The system SHALL, when a user sends `/start` in a private chat with Simple_PayNow_Bot, ask in order for the payee (a Singapore mobile number or a UEN), then the amount, then a short description. The payee is required. The amount and the description are optional, and each question SHALL offer a Skip button. After the last question the system SHALL show a confirmation before generating the QR.

#### Scenario: Full conversation

- **WHEN** the user sends `/start`, then a valid payee, an amount `12.50`, a choice on changing the amount and the description `Lunch`, and then confirms
- **THEN** the bot replies with a PayNow QR image for that payee, amount and description

#### Scenario: Skipping the optional questions

- **WHEN** the user gives a valid payee, taps Skip on both the amount and the description, and confirms
- **THEN** the bot replies with a QR image that has no fixed amount and no description

#### Scenario: Invalid payee

- **WHEN** the user's payee is not a valid mobile number or UEN
- **THEN** the bot explains the accepted formats and asks for the payee again, without moving on

#### Scenario: Invalid amount

- **WHEN** the user's amount is not a positive number with at most two decimals
- **THEN** the bot explains the format and asks for the amount again

#### Scenario: Description too long

- **WHEN** the description is longer than 25 characters
- **THEN** the bot says the limit is 25 characters and asks again

## ADDED Requirements

### Requirement: The bot confirms every answer before generating the QR

The system SHALL, after the last question, show one summary of what the user entered, with Confirm and Cancel buttons, and SHALL NOT generate the QR until the user confirms. The summary SHALL show the payee (type and number), the amount or that the payer sets it, whether the payer can change the amount (only when an amount was given), and the description or that there is none.

#### Scenario: Summary shown

- **WHEN** the user has answered every question
- **THEN** the bot shows the payee, amount, change-amount choice and description, with Confirm and Cancel buttons, and no QR has been sent yet

#### Scenario: Summary without an amount

- **WHEN** the user skipped the amount
- **THEN** the summary says the payer sets the amount and does not mention changing it

#### Scenario: Confirm

- **WHEN** the user taps Confirm
- **THEN** the buttons are removed from the summary and the QR is sent

#### Scenario: Cancel

- **WHEN** the user taps Cancel
- **THEN** nothing is generated, the conversation is cleared and the user is told to send `/start` to begin again

#### Scenario: Text instead of a button

- **WHEN** the user types text while the summary is waiting
- **THEN** the bot asks them to tap Confirm or Cancel and nothing changes

#### Scenario: Double tap

- **WHEN** the user taps Confirm twice quickly
- **THEN** exactly one QR is sent

#### Scenario: Payee number stays out of the QR message

- **WHEN** the QR is sent after Confirm
- **THEN** the QR image and caption still do not show the payee number, although the summary did
