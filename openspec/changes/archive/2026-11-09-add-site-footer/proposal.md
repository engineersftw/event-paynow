# Proposal

## Why

The web pages carry no attribution. The owner wants credit for the work, a way for visitors to find the author, and a pointer to the open source repository, on every page the site serves.

## What Changes

- A **footer on every web page** (the landing page, the event admin page and the payer page) reading: "Built by Michael Cheng & Claude Code AI. Open Source with ❤️."
- "Michael Cheng" links to https://linkedin.com/in/miccheng; "Open Source" links to the source repository https://github.com/engineersftw/event-paynow. Both open in a new tab with `rel="noopener noreferrer"`.
- One shared footer (markup and style) used by all three pages, so the wording and links are defined once. It follows the light and dark themes and fits phones down to 320 px.
- Docs updated.

Out of scope: a link for "Claude Code AI", a licence statement or year, a footer on non-HTML responses (API JSON, QR images), analytics.

## Capabilities

### New Capabilities

- `site-footer`: the attribution footer shown on every web page.

### Modified Capabilities

(none)

## Impact

- `src/web/page.ts` (a shared `FOOTER_HTML` / `FOOTER_CSS` used by `renderLandingPage`, `renderPage` and `renderPayerPage`), tests, README, `docs/architecture.md`, `AGENTS.md`.
- Pages-only deploy; no migration, no Worker change. The links are plain anchors, so the landing page still makes no third-party request before a click.
