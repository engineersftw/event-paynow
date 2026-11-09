# social-sharing Specification

## Purpose

Makes the landing page and the payment pages show a proper preview (title, description and image) when their links are shared in chats and on social networks.

## Requirements

### Requirement: The landing page and payment pages carry social preview tags

The system SHALL include in the HTML head of the landing page and of every payment page the Open Graph tags (title, description, type, URL, site name and an image with its size and alt text), the Twitter large-image card tags, a `description` meta tag and a canonical link. They SHALL be in the HTML the server returns, not added by JavaScript, so crawlers that do not run scripts can read them.

#### Scenario: Landing page

- **WHEN** a crawler fetches `/`
- **THEN** the returned HTML has the title "Event PayNow Bot", a description of what the bot does, the explainer image, the page's own URL, and the Twitter large-image card

#### Scenario: Payment page

- **WHEN** a crawler fetches `/pay/<ref>` for an existing event named "Team Dinner"
- **THEN** the returned HTML has the title "Pay for Team Dinner", a description that mentions it, the same image and the page's own URL

#### Scenario: Not added by script

- **WHEN** the page is fetched without running JavaScript
- **THEN** all the tags are already present

### Requirement: Preview URLs are absolute and follow the site's own address

Every URL in the preview tags (page, canonical and image) SHALL be absolute and built from the origin the page was requested on, so previews work on the custom domain, on the default Pages domain and in local development.

#### Scenario: Custom domain

- **WHEN** a page is requested on `https://event-paynow.engineers.sg`
- **THEN** its image and page URLs start with that origin

#### Scenario: Another host

- **WHEN** the same page is requested on a different host
- **THEN** its image and page URLs start with that host's origin

### Requirement: Payment page previews name the event safely

The payment page's preview SHALL use the event's name in its title and description when the event exists and is open, and SHALL use generic wording when the event is unknown, closed or cannot be read. The name SHALL be escaped wherever it is placed in the HTML and shortened to a reasonable length. A failure to read the event SHALL NOT make the page fail.

#### Scenario: Hostile event name

- **WHEN** the event's name contains quotes, angle brackets or script tags
- **THEN** the tags contain it escaped, and no markup from the name is interpreted

#### Scenario: Unknown or closed event

- **WHEN** the event does not exist or is closed
- **THEN** the preview uses the generic title and description and the page still loads

#### Scenario: Database trouble

- **WHEN** the event lookup fails
- **THEN** the preview uses the generic wording and the page still loads

#### Scenario: Very long name

- **WHEN** the event name is longer than the limit
- **THEN** the title uses a shortened version ending in an ellipsis

### Requirement: One lightweight preview image

The system SHALL serve the explainer poster as a 1280x720 JPEG of about 100 KB, from the site itself, and use it as the preview image on the landing page and on the payment pages. The admin page SHALL NOT carry social preview tags.

#### Scenario: The image

- **WHEN** the preview image URL is requested
- **THEN** it returns a JPEG of 1280 by 720 pixels that is under 200 KB

#### Scenario: Private page

- **WHEN** an event admin page is fetched
- **THEN** it has no Open Graph or Twitter tags
