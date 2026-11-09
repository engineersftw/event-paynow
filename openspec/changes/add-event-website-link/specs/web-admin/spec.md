## ADDED Requirements

### Requirement: The event page links to the event website

The event page SHALL show a link to the event's website under the event title when the event has one, displayed as the address's host name, opening in a new tab with `rel="noopener noreferrer nofollow"`. When the event has no website, nothing SHALL be shown for it.

#### Scenario: Event with a website

- **WHEN** an admin opens the page for an event whose website is `https://www.example.com/dinner`
- **THEN** a link labelled with the host `www.example.com` appears under the title and opens the full address in a new tab

#### Scenario: Event without a website

- **WHEN** an admin opens the page for an event with no website
- **THEN** no website link is shown

#### Scenario: Only web addresses become links

- **WHEN** the stored value is not an `http` or `https` address
- **THEN** it is not turned into a link
