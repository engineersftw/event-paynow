## ADDED Requirements

### Requirement: The payment page links to the event website

The payment page SHALL show a link to the event's website under the page title when the event has one, displayed as the address's host name, opening in a new tab with `rel="noopener noreferrer nofollow"`, for signed-in and anonymous visitors alike. When the event has no website, nothing SHALL be shown for it.

#### Scenario: Event with a website

- **WHEN** a visitor opens the payment page for an event whose website is `https://www.example.com/dinner`
- **THEN** a link labelled `www.example.com` appears under the title and opens the full address in a new tab

#### Scenario: Event without a website

- **WHEN** a visitor opens the payment page for an event with no website
- **THEN** no website link is shown

#### Scenario: Closed event

- **WHEN** the event is closed
- **THEN** the page still shows the website link beside the closed notice

#### Scenario: Only web addresses become links

- **WHEN** the stored value is not an `http` or `https` address
- **THEN** it is not turned into a link
