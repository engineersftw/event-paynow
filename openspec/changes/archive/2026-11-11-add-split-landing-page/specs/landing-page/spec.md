## ADDED Requirements

### Requirement: The home page links to the Split PayNow Bot page

The home page SHALL show a short link to the Split PayNow Bot page (`/split`) with a line saying what it is for, so a visitor looking for the bill splitter finds it. The link SHALL be shown only when the Split page is available.

#### Scenario: Link shown

- **WHEN** the home page is shown and the Split bot's username is configured
- **THEN** it has a link to `/split` that mentions splitting a bill

#### Scenario: Not configured

- **WHEN** the Split bot's username is not configured
- **THEN** the home page has no link to `/split`
