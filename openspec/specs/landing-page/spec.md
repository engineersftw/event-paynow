# landing-page Specification

## Purpose

A public home page at the root of the web site that tells visitors what the Event PayNow Bot does and gives them a link to add it on Telegram.

## Requirements

### Requirement: The site root is a public landing page

The system SHALL serve an HTML landing page at `/` to anyone, without sign-in and without reading any event or payment data. The page SHALL describe what the bot does and how to get started, and SHALL name the bot with its logo.

#### Scenario: Anonymous visitor

- **WHEN** a visitor with no session opens `/`
- **THEN** the landing page is shown, not a sign-in prompt or an error

#### Scenario: What the bot does

- **WHEN** the landing page is shown
- **THEN** it explains that the bot creates events with a PayNow payee, issues PayNow QR codes for payment requests, tracks received payments and paybacks, and checks attendees in by their QR

#### Scenario: Getting started

- **WHEN** the landing page is shown
- **THEN** it lists the first steps: add the bot to the group, run `/init` to create an event, then share the event's payment page or issue QR codes with `/start`

### Requirement: The landing page links to the bot on Telegram

The system SHALL show a prominent button that opens the bot in Telegram (`https://t.me/<bot username>`), using the configured bot username so the link follows the deployed bot. The button SHALL be reachable without scrolling on a phone-sized screen.

#### Scenario: Add the bot

- **WHEN** a visitor taps the button
- **THEN** Telegram opens the bot's chat at `https://t.me/<configured bot username>`

#### Scenario: Visible on a phone

- **WHEN** the page is opened at 360 px width
- **THEN** the button is visible without scrolling

### Requirement: The landing page matches the other pages

The landing page SHALL use the same visual design, bot logo and light/dark toggle as the other web pages, SHALL share the saved theme choice with them, and SHALL fit phone screens down to 320 px without horizontal scrolling.

#### Scenario: Shared theme

- **WHEN** a visitor chose dark mode on another page and opens `/`
- **THEN** the landing page is dark

#### Scenario: Narrow screen

- **WHEN** the page is opened at 320 px width
- **THEN** nothing overflows horizontally

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
