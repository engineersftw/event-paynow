# split-landing-page Specification

## Purpose

A public page at `/split` that tells visitors what the Split PayNow Bot does, how a split works and what it stores, and gives them a link to open the bot on Telegram.

## Requirements

### Requirement: The site serves a public page for the Split PayNow Bot

The system SHALL serve an HTML page at `/split` to anyone, without sign-in and without reading any event, payment or split data. The page SHALL name the Split PayNow Bot with its own logo, served from the site, and SHALL use that logo as its icon in the browser tab; it SHALL NOT show the Event PayNow Bot's logo. When the Split bot's username is not configured, `/split` SHALL answer 404.

#### Scenario: Anonymous visitor

- **WHEN** a visitor with no session opens `/split`
- **THEN** the Split PayNow Bot page is shown, not a sign-in prompt or an error

#### Scenario: The logo

- **WHEN** the page is shown
- **THEN** its header image and tab icon are the Split PayNow Bot logo from the site, a PNG with a transparent background of at most 128 by 128 pixels

#### Scenario: Trailing slash

- **WHEN** a visitor opens `/split/`
- **THEN** they see the same page

#### Scenario: Not configured

- **WHEN** the Split bot's username is not set for the site
- **THEN** `/split` answers 404

### Requirement: The page explains the bot, how to start and what it stores

The page SHALL describe what the bot does: an equal split with one QR for one share, custom amounts per person with @mentions whose QRs are sent by direct message, a receipt photo read for items, GST and service charge, and, in a group, members claiming their own items and paying at once. It SHALL list how to start (`/split`, `/split_custom`, `/split_receipt`, and adding the bot to a group or messaging it), show the order of a split (the payee and whether the payee is the user first, then the bill, then a summary to confirm), and say what the bot keeps: nothing beyond the conversation, receipt photos are never stored, and a mentioned person's username and a waiting QR are kept briefly and can be deleted with `/forget`.

#### Scenario: What it does

- **WHEN** the page is shown
- **THEN** it explains the equal split, custom amounts with mentions, the receipt scan and group claiming

#### Scenario: Getting started

- **WHEN** the page is shown
- **THEN** it lists `/split`, `/split_custom` and `/split_receipt` and how to add the bot to a group

#### Scenario: Privacy

- **WHEN** the page is shown
- **THEN** it says receipt photos are not stored and that `/forget` deletes what the bot remembers about a person

### Requirement: The page links to the bot on Telegram

The page SHALL show a prominent button that opens the bot in Telegram (`https://t.me/<Split bot username>`), using the configured username so the link follows the deployed bot, and SHALL repeat it at the end of the page. The first button SHALL be reachable without scrolling on a phone-sized screen.

#### Scenario: Add the bot

- **WHEN** a visitor taps the button
- **THEN** Telegram opens the bot's chat at `https://t.me/<configured Split bot username>`

#### Scenario: Visible on a phone

- **WHEN** the page is opened at 360 px width
- **THEN** the button is visible without scrolling

### Requirement: The Split page matches the other pages

The page SHALL use the same visual design, light/dark toggle and footer as the other web pages, SHALL share the saved theme choice with them, SHALL link back to the home page, and SHALL fit phone screens down to 320 px without horizontal scrolling. It SHALL NOT load anything from a third party.

#### Scenario: Shared theme

- **WHEN** a visitor chose dark mode on another page and opens `/split`
- **THEN** the page is dark

#### Scenario: Footer

- **WHEN** the page is shown
- **THEN** it ends with the same attribution footer as the other pages

#### Scenario: Narrow screen

- **WHEN** the page is opened at 320 px width
- **THEN** nothing overflows horizontally

#### Scenario: Nothing third party

- **WHEN** the page loads
- **THEN** it requests nothing from any other site
