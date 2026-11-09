## MODIFIED Requirements

### Requirement: The landing page shows the explainer video, loaded only on click

The system SHALL show the YouTube explainer video on the landing page, below the first Add-the-bot button, as a card showing the explainer's poster image with a Play button over it. The poster SHALL come from the site itself. The page SHALL NOT request anything from YouTube or Google until the visitor clicks Play. On click, the card SHALL be replaced by the video player from `youtube-nocookie.com`, which starts playing. Under the card there SHALL be a plain link to the video on YouTube.

#### Scenario: Before clicking

- **WHEN** a visitor opens the landing page
- **THEN** they see the card with the poster image and a Play button and the "Watch on YouTube" link, and the page contains no YouTube player and has made no request to YouTube

#### Scenario: Clicking Play

- **WHEN** the visitor clicks Play
- **THEN** the card is replaced by the embedded player from `youtube-nocookie.com`, which starts playing the video

#### Scenario: Without JavaScript

- **WHEN** the visitor's browser has JavaScript off
- **THEN** the "Watch on YouTube" link still takes them to the video
