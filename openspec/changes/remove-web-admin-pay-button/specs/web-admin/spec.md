## MODIFIED Requirements

### Requirement: /web_admin offers the Mini App and the browser page

When the Mini App is configured, `/web_admin` SHALL give each event a button that opens the Mini App for that event and a second button with the event page's browser address. It SHALL NOT show a Pay button; the payer link stays available from `/web_payment`. When the Mini App is not configured, `/web_admin` SHALL give each event the browser button alone.

#### Scenario: Mini App configured

- **WHEN** a user sends `/web_admin` in a chat with events and the Mini App is configured
- **THEN** each event has a button that opens the Mini App and a button with its browser address, and no Pay button

#### Scenario: Mini App not configured

- **WHEN** a user sends `/web_admin` and the Mini App is not configured
- **THEN** each event has the browser button alone, and no Pay button

#### Scenario: Payer link elsewhere

- **WHEN** an admin wants the payer link for an event
- **THEN** `/web_payment` lists it, and the event page has its own Pay button
