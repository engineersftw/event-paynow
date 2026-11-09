# Proposal

## Why

The landing page and the payment pages (`/pay/<event>`) are meant to be shared in chats and on social networks, but they carry no Open Graph or Twitter card tags, so a pasted link shows a bare URL or a poor preview. Separately, the click-to-play video card on the landing page shows only the logo; the explainer's own title frame (`out/explainer/poster.png`) would look far better and tell visitors what the video is.

## What Changes

- **Social preview tags on the landing page and on every payment page**: `og:title`, `og:description`, `og:type`, `og:url`, `og:site_name`, `og:locale`, `og:image` (with width, height, type and alt text), the Twitter card tags (`summary_large_image`), plus a plain `description` meta and a canonical link. URLs are absolute and built from the request's own origin, so they work on the custom domain, on `pages.dev` and locally.
- **Payment pages name the event**: the server looks the event up when serving `/pay/<ref>` and uses "Pay for <event name>" as the title (and in the description and the page `<title>`); the name is HTML-escaped and length-capped. An unknown event, a closed event, or a lookup failure falls back to generic wording, never an error page.
- **One image for everything**: `out/explainer/poster.png` (1920x1080, 446 KB, gitignored) is converted once to a 1280x720 JPEG (about 100 KB) committed as `web/public/explainer-poster.jpg`. It is the preview image on the landing page and on the payment pages, and the thumbnail of the click-to-play video card (a same-origin image, so there is still no request to YouTube before a click).
- `/explainer-poster.jpg` is excluded from the Pages catch-all Function in `_routes.json`, like the logo.
- The admin page (`/events/<ref>`) is private and gets no social tags.
- Docs: the conversion command and how to check previews.

Out of scope: a per-event generated image, `robots`/`noindex` handling, favicons or app icons, a sitemap, JSON-LD, analytics, regenerating the JPEG from `npm run video` (that script must keep `git status` clean).

## Capabilities

### New Capabilities

- `social-sharing`: the preview tags and image on the landing page and payment pages.

### Modified Capabilities

- `landing-page`: the video card shows the explainer's poster image.

## Impact

- `src/web/page.ts` (shared meta helper, `renderLandingPage`, `renderPayerPage`, `videoCard`), `src/web/handler.ts` (origin passed in; event lookup for `/pay/<ref>`), `web/public/explainer-poster.jpg` (new, committed), `web/public/_routes.json`, tests, README, AGENTS.md, `docs/architecture.md`.
- Pages-only deploy; no migration, no Worker change. The payment page now makes one small read-only database query per page load.
