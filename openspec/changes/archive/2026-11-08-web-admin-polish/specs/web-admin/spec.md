# Spec Delta

## ADDED Requirements

### Requirement: The page header names the event and shows the bot logo

The system SHALL title the page `Event: <Event Name>` and SHALL show the bot's logo at the top left of the header. The logo SHALL have a transparent background so it looks right in both themes, SHALL be served as a static file and used as the page icon, and the page SHALL still show its title when the logo fails to load.

#### Scenario: Header

- **WHEN** an admin opens the page for an event named "Team Dinner"
- **THEN** the header reads "Event: Team Dinner" with the logo to its left

#### Scenario: Logo unavailable

- **WHEN** the logo image cannot be loaded
- **THEN** the title is still shown

### Requirement: Viewers can switch between light and dark themes

The system SHALL offer a toggle in the header that switches the page between light and dark. With no saved choice the page SHALL follow the viewer's system preference; once the viewer chooses, that choice SHALL override the system preference and be remembered in that browser. The page SHALL work, in the system theme, when browser storage is unavailable.

#### Scenario: Manual choice

- **WHEN** a viewer whose system is light taps the toggle
- **THEN** the page turns dark and stays dark on reload

#### Scenario: No saved choice

- **WHEN** a viewer with a dark system preference opens the page for the first time
- **THEN** the page is dark

### Requirement: Status pills use distinct colours

The system SHALL colour each status pill by status, with pending, received and voided payments (and pending, sent and cancelled paybacks) visibly different in both themes, and SHALL keep the status text in the pill.

#### Scenario: Different statuses

- **WHEN** the list shows a pending, a received and a voided payment
- **THEN** their pills have three different background colours and each says its status

### Requirement: The payback count is prominent

The system SHALL show the number of a payment's paybacks as a count chip on its payback button that stands out from the button label.

#### Scenario: Count

- **WHEN** a payment has 2 paybacks
- **THEN** its payback button shows a distinct chip with 2

### Requirement: Row action buttons are large and clear

The system SHALL render the per-payment and per-payback action buttons (the expand buttons, Received, Void, Sent, Cancel and Pay back) with a touch target at least 40px tall and a visible label, with primary and destructive actions visually distinct.

#### Scenario: Touch size

- **WHEN** an admin views a row on a phone
- **THEN** each action button is at least 40px tall

### Requirement: Dates use the dd-MMM-YYYY format

The system SHALL display dates on the page as day, abbreviated English month and four-digit year, such as `08-Nov-2026`, without a time of day.

#### Scenario: Created date

- **WHEN** a payment was created on 8 November 2026
- **THEN** the page shows `08-Nov-2026`
