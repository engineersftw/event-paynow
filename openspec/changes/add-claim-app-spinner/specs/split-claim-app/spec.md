## ADDED Requirements

### Requirement: The app shows when it is waiting for the server

The system SHALL show a spinner with the words "Updating…" in the app for as long as the first load or a change the organiser made is waiting for an answer. While it waits, the app SHALL dim the items and keep them from being tapped, and the spinner and the dimming SHALL be gone once the answer or an error has arrived. The refresh the app makes by itself every few seconds SHALL NOT show the spinner or dim the items.

#### Scenario: A change is waiting

- **WHEN** the organiser taps Add and the answer has not arrived
- **THEN** the spinner is shown, the items are dimmed and a second tap does nothing

#### Scenario: The answer arrives

- **WHEN** the answer to the change arrives
- **THEN** the spinner and the dimming are gone and the items show the new claims

#### Scenario: A change is refused

- **WHEN** the app refuses a change, for example a name that is too long
- **THEN** the reason is shown and the spinner is gone

#### Scenario: No connection

- **WHEN** the request fails because there is no connection
- **THEN** the spinner is gone and the app says so

#### Scenario: First load

- **WHEN** the app opens and the items have not arrived yet
- **THEN** the spinner is shown until they do

#### Scenario: The background refresh

- **WHEN** the app refreshes by itself while nobody is making a change
- **THEN** no spinner is shown and the items are not dimmed
