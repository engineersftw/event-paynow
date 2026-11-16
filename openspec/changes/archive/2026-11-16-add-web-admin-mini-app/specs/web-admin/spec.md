## ADDED Requirements

### Requirement: The event page opens as a Telegram Mini App

The system SHALL let the event page open inside Telegram as a Mini App of the Event bot. Inside Telegram it SHALL sign the visitor in from Telegram's signed launch data and then behave exactly as it does after a Login Widget sign-in, including the chat-admin check.

#### Scenario: Admin opens the Mini App

- **WHEN** a chat admin opens the Mini App for an event
- **THEN** the event page loads signed in, without the Telegram sign-in prompt, and shows that event's data

#### Scenario: Not an admin

- **WHEN** a user who is not an admin of the event's chat opens the Mini App for it
- **THEN** the user sees the "not allowed" message and no event data

### Requirement: Mini App launch data is verified

The system SHALL accept Mini App sign-in only from launch data that carries a valid signature for the Event bot and is no older than a day, and SHALL otherwise sign nobody in. The session it sets SHALL last as long as a Login Widget session.

#### Scenario: Forged or stale launch data

- **WHEN** the launch data fails verification or is older than a day
- **THEN** the system answers that sign-in failed and sets no session

#### Scenario: Browser visit

- **WHEN** the event page is opened in a browser outside Telegram
- **THEN** it shows the Telegram Login Widget as before

### Requirement: The Mini App works where cookies are blocked

The system SHALL let the Mini App page keep its session without a cookie: the sign-in answer SHALL carry the session value, and the system SHALL accept that value from the page in an `Authorization: Bearer` header wherever it accepts the session cookie, with the same expiry and the same chat-admin check. A missing, forged or expired value SHALL count as not signed in.

#### Scenario: Cookie dropped by the client

- **WHEN** the Mini App signs in and the client keeps no cookie
- **THEN** the event page still loads its data and its QR images using the session value in the header

#### Scenario: Forged value

- **WHEN** a request carries a bearer value that is not a valid session
- **THEN** the system treats it as not signed in

### Requirement: One Mini App opens any event

The system SHALL provide a Mini App entry address that opens the event named by the signed start value of the launch, so one Mini App serves every event. The start value SHALL come only from the verified launch data.

#### Scenario: Entry with an event

- **WHEN** the Mini App is opened from a link whose start value is an event reference
- **THEN** the event page for that event opens

#### Scenario: Entry without an event

- **WHEN** the Mini App is opened with no start value
- **THEN** the page tells the user to open an event with `/web_admin` in the chat

### Requirement: /web_admin offers the Mini App and the browser page

When the Mini App is configured, `/web_admin` SHALL give each event a button that opens the Mini App for that event and a second button with the event page's browser address. The Pay button SHALL stay. When the Mini App is not configured, `/web_admin` SHALL answer exactly as it does without it.

#### Scenario: Mini App configured

- **WHEN** a user sends `/web_admin` in a chat with events and the Mini App is configured
- **THEN** each event has a button that opens the Mini App, a button with its browser address, and the Pay button

#### Scenario: Mini App not configured

- **WHEN** a user sends `/web_admin` and the Mini App is not configured
- **THEN** each event has the browser button and the Pay button only, as before

### Requirement: The browser address keeps working

The system SHALL keep serving the event page at `/events/<ref>` with Telegram sign-in by the Login Widget, unchanged, for visitors outside Telegram.

#### Scenario: Existing link

- **WHEN** an admin opens a saved `/events/<ref>` link in a browser and signs in with Telegram
- **THEN** the page works as before
