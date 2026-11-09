# Design

## Context

`renderLandingPage(botUsername)` in `src/web/page.ts` builds the page: logo and title, intro, the Add-the-bot button (`cta`), "What it does", "Get started", and the button again. It has the same CSS tokens and light/dark handling as the other pages and no Content-Security-Policy, so an iframe from YouTube is not blocked. The video (id `ezOo1OIhl-Y`) is public and embeddable (YouTube's oEmbed answers for it).

## Goals / Non-Goals

**Goals:** show the video on the landing page without slowing it or contacting YouTube before the visitor asks for it.

**Non-Goals:** transcript, autoplay, a YouTube thumbnail, analytics, several videos.

## Decisions

1. **Click-to-load facade, not an always-on iframe.** An embedded YouTube player downloads a few hundred kB of script and sets third-party cookies as soon as the page loads, even if nobody plays it. The landing page is the first impression, so it stays fast and free of third-party requests until a click. The card is a `<button>` styled 16:9 (`aspect-ratio: 16 / 9; width: 100%`), with the bot logo, the text "Watch the 75-second explainer" and a play triangle drawn in CSS.
2. **Privacy-enhanced embed.** On click, a small inline script replaces the button with `<iframe src="https://www.youtube-nocookie.com/embed/<id>?autoplay=1&rel=0" title="Event PayNow Bot explainer video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin">` of the same 16:9 box. Autoplay is allowed because the click is the visitor's request to play.
3. **No-JavaScript fallback:** a normal `<a href="https://youtu.be/<id>">Watch on YouTube</a>` under the card, always present.
4. **One constant** `EXPLAINER_VIDEO_ID = 'ezOo1OIhl-Y'` in `page.ts`, checked against `/^[A-Za-z0-9_-]{11}$/` at render time (the page otherwise renders without the video block), so a mistyped id cannot inject markup. The script reads the id from a `data-video` attribute on the button.
5. **No thumbnail from YouTube.** Using `i.ytimg.com/vi/<id>/hqdefault.jpg` would send a request to Google when the page loads. The card uses the logo instead. If a richer card is wanted later, the poster image from `npm run video` could be added to `web/public/`.
6. **Where:** directly under the first Add-the-bot button, above "What it does", so the page reads: tagline, button, video, details. The CSS reuses the existing tokens (`--border`, `--muted`, `--fg`) so dark mode works.
7. **Tests (node):** the HTML contains the button with the id in `data-video`, the "Watch on YouTube" link, no `<iframe` and no `youtube` host in a `src` before the click; the inline script is valid JavaScript and builds a `youtube-nocookie.com` embed; a bad id leaves the video block out.
8. **Visual check:** Playwright at 320 px and 390 px, light and dark, before and after the click (the iframe's `src` is asserted, the page is not actually asked to play).

## Risks / Trade-offs

- **One more click** before the video plays, compared with an always-on player. That is the price of a fast, third-party-free page.
- **The card is not a real thumbnail**, so it shows less than a YouTube preview would.
- **If the video is made private or removed**, the card still shows and the player then shows YouTube's own error; the "Watch on YouTube" link would also fail. Replacing the id is a one-line change.
- **Third-party content after the click:** once the player loads, YouTube's own cookies and policies apply (reduced by the `nocookie` domain).
