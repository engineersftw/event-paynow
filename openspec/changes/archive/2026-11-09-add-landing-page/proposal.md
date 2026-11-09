# Proposal

## Why

The Pages site at `event-paynow.engineers.sg` has no front door: `/` is a one-line placeholder ("Open an event from the bot with /web_admin."). People who hear about the bot or are sent the domain cannot tell what it does or how to start using it.

## What Changes

- Serve a landing page at `/` that says what the Event PayNow Bot does (create events, issue PayNow QR codes, track and pay back payments, check attendees in) and how to start (add the bot, `/init`, share the payment page).
- A prominent **Add the bot on Telegram** button linking to `https://t.me/<BOT_USERNAME>` (the existing `BOT_USERNAME` var), so the link follows the configured bot.
- Same look as the other pages: bot logo, light/dark toggle sharing the saved theme, mobile-first (checked down to 320 px).
- Replace the placeholder `web/public/index.html`; `/` is now rendered by the Pages Function like the other pages.
- Update README and docs.

Out of scope: marketing site, screenshots, analytics, translations, a sign-in prompt on the landing page.

## Capabilities

### New Capabilities

- `landing-page`: the public home page at `/` introducing the bot and linking to it on Telegram.

### Modified Capabilities

(none)

## Impact

- `src/web/page.ts` (new `renderLandingPage`), `src/web/handler.ts` (route `/`), `web/public/index.html` (removed), tests, `README.md`, `AGENTS.md`, `docs/architecture.md`.
- Pages-only change: the deploy filter already covers `web/` and `src/web/`; no migration, no Worker change.
