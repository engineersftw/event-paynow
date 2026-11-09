# site-footer Specification

## Purpose

A short attribution footer shown at the bottom of every web page, crediting the author and linking to the open source repository.

## Requirements

### Requirement: Every web page shows the attribution footer

The system SHALL show a footer at the bottom of the landing page, the event admin page and the payer page that reads "Built by Michael Cheng & Claude Code AI." on the first line and "Open Source with ❤️." on the second. The name "Michael Cheng" SHALL link to https://linkedin.com/in/miccheng and the words "Open Source" SHALL link to the source repository at https://github.com/engineersftw/event-paynow.

#### Scenario: Landing page

- **WHEN** a visitor opens the landing page
- **THEN** the footer is at the bottom with the author's name linked to LinkedIn and "Open Source" linked to the repository

#### Scenario: Event admin page

- **WHEN** an admin opens an event page, including when they are signed out or not allowed to see the event
- **THEN** the same footer is shown at the bottom

#### Scenario: Payer page

- **WHEN** an attendee opens the payment page, signed in or not
- **THEN** the same footer is shown at the bottom

### Requirement: The footer links open safely and do not add requests

The footer links SHALL open in a new tab without giving the new page access to the old one (`rel="noopener noreferrer"`), and SHALL be plain links: the footer SHALL NOT load any script, image or other resource from another site.

#### Scenario: Opening a link

- **WHEN** a visitor clicks a footer link
- **THEN** the destination opens in a new tab and cannot reach back to the page

#### Scenario: Loading a page

- **WHEN** any page is loaded
- **THEN** the footer causes no request to LinkedIn, GitHub or any other host

### Requirement: The footer matches the page design

The footer SHALL be small, muted and centred, SHALL follow the light and dark themes, and SHALL fit phone screens down to 320 px without horizontal scrolling.

#### Scenario: Dark theme

- **WHEN** a page is shown in dark mode
- **THEN** the footer text and links are readable against the dark background

#### Scenario: Narrow screen

- **WHEN** a page is shown at 320 px width
- **THEN** the two footer lines each fit or wrap, and nothing overflows
