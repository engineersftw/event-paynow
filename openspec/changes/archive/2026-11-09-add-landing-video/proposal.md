# Proposal

## Why

The explainer video is published on YouTube (https://youtu.be/ezOo1OIhl-Y, "About Event_PayNow_Bot", Engineers.SG) but visitors to the landing page cannot see it. Showing it there gives new visitors the quickest explanation of the bot, next to the Add-the-bot button.

## What Changes

- The landing page shows the video **under the first Add-the-bot button**, as a **click-to-play** card: a 16:9 card with the bot logo and "Watch the 75-second explainer", and a Play button. **Nothing is requested from YouTube until the visitor clicks.** Clicking replaces the card with the YouTube player (privacy-enhanced domain `youtube-nocookie.com`) and starts playing.
- A plain "Watch on YouTube" link sits under the card, so it also works without JavaScript and for anyone who prefers the YouTube page.
- The video id lives in one constant in `src/web/page.ts` (validated to YouTube's 11-character id format) so replacing the video later is a one-line change.
- Layout checked at 320 px and 390 px, light and dark; docs updated.

Out of scope: a transcript on the page (YouTube hosts the captions), autoplay, a YouTube thumbnail (the card uses the site's own logo so the page makes no YouTube requests before a click), analytics, more videos.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `landing-page`: the page shows the YouTube explainer video, loaded only on click.

## Impact

- `src/web/page.ts` (`renderLandingPage`), tests (`test/node/web-page.test.ts`), README, `docs/architecture.md`, `AGENTS.md`.
- Pages-only deploy; no migration, no Worker change, no new dependency. The page itself stays free of third-party requests until the visitor clicks play.
