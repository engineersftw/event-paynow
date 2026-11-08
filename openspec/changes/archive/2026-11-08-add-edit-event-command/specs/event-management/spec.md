## ADDED Requirements

### Requirement: Edit an open event via /edit_event

The bot SHALL provide an `/edit_event` command that changes the name, the payee or the default amount of an open event of the current chat and topic. The flow picks the event (skipped when only one is open), then the field, then takes the new value. A valid value SHALL be saved at once and the bot SHALL reply with all the event's final values (name, payee, default amount or "none"), marking the changed field. Validation SHALL match `/init`; the default amount can also be removed.

#### Scenario: Change the name

- **WHEN** an administrator sends `/edit_event`, picks the only open event, taps Name and sends `Team lunch`
- **THEN** the event's name becomes `Team lunch` and the bot replies with the event's final name, payee and default amount (or "none"), with the name marked as changed

#### Scenario: Change the payee

- **WHEN** the administrator taps Payee and sends a valid mobile number or UEN
- **THEN** the event's payee is replaced by the normalised value, and an invalid value is rejected with a re-prompt without changing the event

#### Scenario: Set or clear the default amount

- **WHEN** the administrator taps Default amount and sends `21`, or taps Clear
- **THEN** the event's default amount becomes 2100 cents, or none respectively, and an invalid amount such as `abc`, `0` or `1.234` is rejected with a re-prompt

#### Scenario: Existing payments are unchanged

- **WHEN** an event with payments is renamed or its payee is changed
- **THEN** those payments keep the description and payee they were created with, and payments created afterwards use the new values

#### Scenario: No open events

- **WHEN** `/edit_event` is sent in a chat or topic with no open event
- **THEN** the bot replies that there is no open event to edit

#### Scenario: Cancel

- **WHEN** the user sends `/cancel` or taps Cancel during the flow
- **THEN** the conversation ends and the event is unchanged

### Requirement: Event edits are restricted to administrators of open events

Only chat administrators (or the user in a private chat) SHALL be allowed to edit an event, checked when `/edit_event` starts and again when the change is saved. Closed events SHALL NOT be editable, and an event of another chat SHALL read as not found.

#### Scenario: Not an administrator

- **WHEN** a member who is not a chat administrator sends `/edit_event` in a group, or loses administrator rights before sending the new value
- **THEN** the bot refuses and the event is not changed

#### Scenario: Event closed meanwhile

- **WHEN** the event is closed between picking it and sending the new value
- **THEN** the bot replies that the event is closed and nothing is changed

#### Scenario: Event of another chat

- **WHEN** a picked event reference belongs to a different chat
- **THEN** the bot treats it as not found and changes nothing
