## MODIFIED Requirements

### Requirement: Edit an open event via /edit_event

The bot SHALL provide an `/edit_event` command that changes the name, the payee, the default amount or the website link of an open event of the current chat and topic. The flow picks the event (skipped when only one is open), then the field, then takes the new value. A valid value SHALL be saved at once and the bot SHALL reply with all the event's final values (name, payee, default amount or "none", website or "none"), marking the changed field. Validation SHALL match `/init`; the default amount and the website link can also be removed.

#### Scenario: Change the name

- **WHEN** an administrator sends `/edit_event`, picks the only open event, taps Name and sends `Team lunch`
- **THEN** the event's name becomes `Team lunch` and the bot replies with the event's final name, payee and default amount (or "none"), with the name marked as changed

#### Scenario: Change the payee

- **WHEN** the administrator taps Payee and sends a valid mobile number or UEN
- **THEN** the event's payee is replaced by the normalised value, and an invalid value is rejected with a re-prompt without changing the event

#### Scenario: Set or clear the default amount

- **WHEN** the administrator taps Default amount and sends `21`, or taps Clear
- **THEN** the event's default amount becomes 2100 cents, or none respectively, and an invalid amount such as `abc`, `0` or `1.234` is rejected with a re-prompt

#### Scenario: Set or clear the website

- **WHEN** the administrator taps Website and sends `https://example.com/lunch`, or taps Clear
- **THEN** the event's website becomes that address, or none respectively, the reply shows the final website (or "none") marked as changed, and an invalid address such as `javascript:alert(1)` is rejected with a re-prompt without changing the event

#### Scenario: Existing payments are unchanged

- **WHEN** an event with payments is renamed or its payee is changed
- **THEN** those payments keep the description and payee they were created with, and payments created afterwards use the new values

#### Scenario: No open events

- **WHEN** `/edit_event` is sent in a chat or topic with no open event
- **THEN** the bot replies that there is no open event to edit

#### Scenario: Cancel

- **WHEN** the user sends `/cancel` or taps Cancel during the flow
- **THEN** the conversation ends and the event is unchanged

## ADDED Requirements

### Requirement: An event can have a website link

The bot SHALL ask in `/init`, after the default amount and before the confirmation, for an optional website address for the event, offering a Skip button. A valid address SHALL be stored on the event; skipping SHALL store none. The confirmation summary and the success message SHALL show the website when one is set.

#### Scenario: Set a website

- **WHEN** a user runs `/init`, enters a name, a payee and an amount (or skips it), sends `https://example.com/dinner` at the website step and confirms
- **THEN** the event is created with that website, and the confirmation and the success message show it

#### Scenario: Skip the website

- **WHEN** the user taps Skip at the website step
- **THEN** the flow moves to the confirmation without a website and the event is created with none

#### Scenario: Address without a scheme

- **WHEN** the user sends `example.com/dinner`
- **THEN** it is stored as `https://example.com/dinner`

#### Scenario: Cancel after entering a website

- **WHEN** the user cancels at the confirmation step
- **THEN** no event is created and no website is stored

#### Scenario: Existing events

- **WHEN** an event was created before this feature
- **THEN** it has no website and everything about it works as before

### Requirement: Website addresses are web addresses only

The bot SHALL accept only addresses that are valid `http` or `https` web addresses with a host name containing a dot, no embedded username or password, no spaces and at most 200 characters, and SHALL reject anything else and ask again without moving on. An address typed without a scheme SHALL be given `https://`.

#### Scenario: Unsafe schemes

- **WHEN** the user sends `javascript:alert(1)`, `data:text/html,x`, `mailto:a@b.com` or `ftp://example.com`
- **THEN** it is rejected and the bot asks again

#### Scenario: Other bad input

- **WHEN** the user sends `https://user:pass@example.com`, `not a url`, `localhost` or an address longer than 200 characters
- **THEN** it is rejected and the bot asks again

#### Scenario: Valid input

- **WHEN** the user sends `https://www.example.com/a?b=1#c`
- **THEN** it is accepted
