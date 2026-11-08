# Spec Delta

## ADDED Requirements

### Requirement: An event can have a default amount

The bot SHALL ask in `/init`, after the payee and before the confirmation, for an optional default amount to collect, offering a Skip button. A valid amount (positive, at most two decimals, parsed as elsewhere) SHALL be stored on the event as integer cents; skipping SHALL store none. The confirmation summary and the success message SHALL show the default amount when one is set.

#### Scenario: Set a default amount

- **WHEN** a user runs `/init`, enters a name and a payee, enters `21` at the default amount step and confirms
- **THEN** the event is created with a default amount of 2100 cents and the success message shows SGD 21.00

#### Scenario: Skip the default amount

- **WHEN** the user taps Skip at the default amount step
- **THEN** the flow moves to the confirmation without an amount and the event is created with no default amount

#### Scenario: Invalid default amount

- **WHEN** the user enters `abc`, `0`, `-5` or `1.234`
- **THEN** the bot rejects it, asks again, and does not advance

#### Scenario: Cancel after entering an amount

- **WHEN** the user cancels at the confirmation step
- **THEN** no event is created and no amount is stored

#### Scenario: Existing events

- **WHEN** an event was created before this feature
- **THEN** it has no default amount and everything about it works as before
