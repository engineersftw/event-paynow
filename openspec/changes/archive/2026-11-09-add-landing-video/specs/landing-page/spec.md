## ADDED Requirements

### Requirement: The landing page shows the explainer video, loaded only on click

The system SHALL show the YouTube explainer video on the landing page, below the first Add-the-bot button, as a card with a Play button. The page SHALL NOT request anything from YouTube or Google until the visitor clicks Play. On click, the card SHALL be replaced by the video player from `youtube-nocookie.com`, which starts playing. Under the card there SHALL be a plain link to the video on YouTube.

#### Scenario: Before clicking

- **WHEN** a visitor opens the landing page
- **THEN** they see the card with a Play button and the "Watch on YouTube" link, and the page contains no YouTube player and has made no request to YouTube

#### Scenario: Clicking Play

- **WHEN** the visitor clicks Play
- **THEN** the card is replaced by the embedded player from `youtube-nocookie.com`, which starts playing the video

#### Scenario: Without JavaScript

- **WHEN** the visitor's browser has JavaScript off
- **THEN** the "Watch on YouTube" link still takes them to the video

### Requirement: The video card is accessible and fits every screen

The video card SHALL be a real button with an accessible name, SHALL keep a 16:9 shape at every width, and SHALL NOT make the page scroll sideways at widths down to 320 px. The embedded player SHALL have a descriptive title and allow full screen.

#### Scenario: Narrow screen

- **WHEN** the page is opened at 320 px width
- **THEN** the card fits the width, keeps its 16:9 shape and nothing overflows

#### Scenario: Keyboard and screen reader

- **WHEN** a visitor tabs to the card
- **THEN** it can be activated with Enter or Space and its name says it plays the explainer video
