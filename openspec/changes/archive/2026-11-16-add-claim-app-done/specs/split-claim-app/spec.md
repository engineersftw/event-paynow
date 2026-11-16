## ADDED Requirements

### Requirement: The organiser can close the claiming from the app

The system SHALL let the organiser close the claiming from the app with a Done button that is always in view, with the same result as Done in the chat: the claim message is closed, and the chat then asks what to do with unclaimed items or posts the summary. It SHALL be refused, with the same reason, until someone other than the organiser has claimed an item. When it succeeds the app SHALL close itself, or say that the claiming is closed and to finish in the chat.

#### Scenario: Everything is claimed

- **WHEN** every item is claimed, someone other than the organiser holds an item, and the organiser taps Done in the app
- **THEN** the claim message in the chat says the claiming is closed and has no buttons, the summary is posted in the chat, and the app closes

#### Scenario: Items nobody claimed

- **WHEN** item 4 is unclaimed and the organiser taps Done in the app
- **THEN** the claim message is closed and the chat asks the organiser what to do with item 4, as it does after Done in the chat

#### Scenario: Nobody else has claimed

- **WHEN** only the organiser holds items and the organiser taps Done in the app
- **THEN** the claiming stays open, nothing is posted in the chat, and the app says someone other than the organiser must claim an item first

#### Scenario: Only the organiser

- **WHEN** a member who is not the organiser opens the app and the interface is asked to close the claiming
- **THEN** it is refused and nothing changes

#### Scenario: Already closed

- **WHEN** the organiser taps Done in the chat and then Done in the app, or the other way round
- **THEN** the second one changes nothing and the app says the claiming is over

#### Scenario: The app cannot close itself

- **WHEN** the claiming is closed from the app and the app is not able to close itself
- **THEN** it shows that the claiming is closed and to finish in the chat

### Requirement: The app leaves the rest of the split to the chat

The system SHALL leave the choice about unclaimed items, the summary, Confirm and Amend to the chat, so that the app changes and closes the claiming only. The app SHALL stop offering changes as soon as the claiming is over, however it was closed.

#### Scenario: Done in the chat

- **WHEN** the organiser taps Done in the chat while the app is open
- **THEN** the app shows that the claiming is over and offers no changes

#### Scenario: Confirm is not in the app

- **WHEN** the organiser looks for Confirm or Amend in the app
- **THEN** there is none; the summary and its buttons are in the chat

## REMOVED Requirements

### Requirement: The app does not close the claiming

**Reason**: The app can now close the claiming (see "The organiser can close the claiming from the app"), so the organiser does not have to leave the app to tap Done in the chat. What stays with the chat is stated in "The app leaves the rest of the split to the chat".
**Migration**: Use the Done button in the app, or Done on the claim message in the chat; both close the claiming in the same way.
