## ADDED Requirements

### Requirement: The review buttons have one row each

The system SHALL lay out the receipt review's buttons one per row so that no label is cut off on a phone: **Add a missing item** when offered, then **Use this**, **Send another photo** and **Type the total instead**. The callback data and behaviour of each button are unchanged.

#### Scenario: Three rows

- **WHEN** the review is shown for a scan that adds up
- **THEN** it has three rows with one button each: Use this, Send another photo, Type the total instead

#### Scenario: Missing item offered

- **WHEN** the review is shown for a scan that looks short
- **THEN** Add a missing item is the first row and the other three follow

### Requirement: The reading notice is removed once the scan is read

The system SHALL delete the "Reading your receipt…" message when the photo has been read and the review is shown. When the scan fails, the message SHALL stay and the failure message SHALL follow it. If the message cannot be deleted, the flow continues.

#### Scenario: Successful scan

- **WHEN** a photo is read successfully
- **THEN** the "Reading your receipt…" message is deleted and the review is shown

#### Scenario: Failed scan

- **WHEN** the photo cannot be read
- **THEN** the "Reading your receipt…" message stays and the bot says it could not read the photo

### Requirement: The colon after a name is optional

The system SHALL accept a name line in the pasted-list format with or without a trailing colon, and `all` in any letter case, so `All`, `All:` and `ALL :` mean the same. The assignment prompt SHALL show the example without a colon and say the colon is optional.

#### Scenario: Without a colon

- **WHEN** the user sends `Sam`, `1. Pizza`, `All`, `2. Steak`
- **THEN** item 2 is shared by everyone named, exactly as with `All:`
