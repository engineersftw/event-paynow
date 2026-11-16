## ADDED Requirements

### Requirement: An event chooses the details its payment page asks for

The system SHALL let an event ask payers for Full name and Email, each switched on or off, and for up to three custom text fields the organiser names (1 to 30 characters, no two alike ignoring case). `/init` SHALL show the two switches on its confirmation message, off unless tapped; `/edit_event` SHALL offer the two switches and adding or removing a custom field. Only chat administrators SHALL change them, on open events.

#### Scenario: Switch on Email while creating an event

- **WHEN** an organiser creates an event with `/init` and switches Email on at the confirmation
- **THEN** the created event asks payers for an email

#### Scenario: Add a custom field

- **WHEN** an administrator edits an open event, chooses form fields, adds a field and sends "Dietary needs"
- **THEN** the event asks payers for "Dietary needs" and the reply lists every field it now asks for

#### Scenario: Too many or repeated custom fields

- **WHEN** an administrator adds a fourth custom field, or one whose name matches an existing field ignoring case
- **THEN** the bot refuses it and says why

#### Scenario: No fields chosen

- **WHEN** an event has no field switched on and no custom field
- **THEN** its payment page asks nothing beyond today's form

#### Scenario: Not an administrator

- **WHEN** a user who is not a chat administrator tries to change the form fields
- **THEN** the bot refuses and nothing changes
