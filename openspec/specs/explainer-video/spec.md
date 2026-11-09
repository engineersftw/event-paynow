# explainer-video Specification

## Purpose

A repeatable build that renders a captioned explainer video for Event PayNow Bot, for organizers and attendees, from sources kept in the repo while the output stays out of Git.

## Requirements

### Requirement: One command builds the explainer video

The system SHALL provide a single command (`npm run video`) that renders the explainer video as an H.264 MP4 at 1920x1080 with captions burned into the picture, so it is understandable with the sound off. It SHALL also write a poster still, a captions file (`captions.srt`) and a plain-text transcript, all taken from the same caption text, into one output folder.

#### Scenario: Building the video

- **WHEN** a developer runs the command on a machine with the headless browser and ffmpeg installed
- **THEN** the output folder contains the MP4, the poster, `captions.srt` and `transcript.txt`

#### Scenario: Length

- **WHEN** the video is rendered
- **THEN** it runs between 60 and 90 seconds

#### Scenario: Plays everywhere

- **WHEN** the MP4 is opened in a browser, on iOS or uploaded to YouTube
- **THEN** it plays (H.264 video, yuv420p pixels, metadata at the start of the file)

### Requirement: The output is kept out of Git

The system SHALL write the video and its companion files to a folder that Git ignores, and SHALL render the intermediate frames outside the repository, so no generated video data is ever staged or committed.

#### Scenario: After a build

- **WHEN** the video has been built
- **THEN** `git status` shows no new or changed files

### Requirement: The video covers organizers and attendees accurately

The video SHALL have two chapters. The Event Organizer chapter SHALL show creating an event, sharing the payment page or issuing a QR code, marking payments received, checking attendees in, and paying back. The Attendee chapter SHALL show opening the link or receiving the QR, paying in a banking app, and keeping the QR for check-in. Every command named in the captions SHALL exist in the bot.

#### Scenario: Organizer chapter

- **WHEN** the video reaches the Event Organizer chapter
- **THEN** it shows `/init`, sharing the payment page or `/start`, Received, Check-In and Pay back

#### Scenario: Attendee chapter

- **WHEN** the video reaches the Attendee chapter
- **THEN** it shows the QR arriving, paying with a banking app, and keeping the QR for check-in

#### Scenario: A renamed command

- **WHEN** a command named in the captions is no longer in the bot's help text
- **THEN** the automated tests fail, so the captions are fixed before the video is rebuilt

### Requirement: The video contains no real personal data

All names, PayNow numbers and QR codes shown in the video SHALL be fictional sample values, and the sample QR SHALL NOT identify a real person or business.

#### Scenario: Sample values

- **WHEN** the scenes show a payee, a payer or a QR code
- **THEN** they use sample names and a fictional UEN
