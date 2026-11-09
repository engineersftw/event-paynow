# Design

## Context

- `renderLandingPage(botUsername)` and `renderPayerPage(ref, botUsername)` in `src/web/page.ts` build the HTML; their `<head>` has only charset, viewport, title, icon, theme script and style. The landing page's video card (`videoCard`) shows the logo and a title.
- `handleWeb` in `src/web/handler.ts` serves `/` and `/pay/<ref>` without touching the database for the shell. `env.paynow_db` is available, and `new D1EventRepository(env.paynow_db).getEventByRef(ref)` is already used by other routes.
- Static files in `web/public/` bypass the Function only when listed in `_routes.json` (`/logo.png`, `/vendor/*` today).
- `out/explainer/poster.png` is 1920x1080, 446 KB, gitignored (the video build must keep `git status` clean).
- Link-preview crawlers (Facebook, LinkedIn, Slack, Telegram, X, WhatsApp) read tags from the returned HTML and do not run JavaScript; they cache results, and prefer images of at least 1200x630 or 16:9.

## Goals / Non-Goals

**Goals:** correct, escaped preview tags in the server-rendered HTML of the landing and payment pages; a light image served from the site; a better video card thumbnail with no request to YouTube.

**Non-Goals:** per-event images, `robots` handling, favicons, sitemap, JSON-LD, analytics, auto-generating the JPEG during `npm run video`.

## Decisions

1. **One image asset:** `web/public/explainer-poster.jpg`, made once with `ffmpeg -i out/explainer/poster.png -vf scale=1280:720 -q:v 3 web/public/explainer-poster.jpg` (about 100 KB; the command goes in the README). 1280x720 is 16:9, accepted by all the big platforms for a large card, and far lighter than the 446 KB PNG. It is committed, so it is not a generated artifact of `npm run video` and the video spec's "git status stays clean" rule is untouched. Excluded from the Function in `_routes.json`.
2. **One helper builds the tags:** `socialMeta({ title, description, url, image })` in `page.ts` returns the `<meta>`/`<link>` block, escaping every value for use in an HTML attribute (`& " < >`, and `'`), and is used by both pages. Tags: `<meta name="description">`, `<link rel="canonical">`, `og:type=website`, `og:site_name=Event PayNow Bot`, `og:locale=en_SG`, `og:title`, `og:description`, `og:url`, `og:image`, `og:image:type=image/jpeg`, `og:image:width=1280`, `og:image:height=720`, `og:image:alt`, `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`, `twitter:image:alt`.
3. **Absolute URLs from the request origin:** `handleWeb` passes `url.origin` to both renderers; image URL is `${origin}/explainer-poster.jpg`, page and canonical URLs are `${origin}${pathname}`. This works on the custom domain, `pages.dev` and local development without configuration. Alternative (a configured canonical site URL) was rejected: one more variable, and the other domain would then show previews pointing at the wrong host.
4. **Landing copy:** title "Event PayNow Bot"; description "Collect PayNow payments for your event from a Telegram group: a QR code for every request, and a clear record of who has paid." (matches the page's lead). Image alt: "Event PayNow Bot: collect PayNow payments for your event, from Telegram."
5. **Payment page copy and lookup:** in the `/pay/<ref>` route, `getEventByRef(ref)` inside a `try/catch`; when the event exists and is `open`: title `Pay for ${name}`, description `Make a PayNow payment for ${name}. Get your own PayNow QR code in seconds, no sign-in needed.` Otherwise (unknown, closed, or the lookup threw): title "Make a PayNow payment", description "Get your own PayNow QR code for this event in seconds, no sign-in needed." The name is shortened to 60 characters with an ellipsis, and the same text is used as the initial `<title>`; existing client script keeps replacing the title with `Pay: <name>` after load. The lookup is one indexed read per page view (`ref` is unique).
6. **The video card shows the poster:** `videoCard(id)` renders an `<img src="/explainer-poster.jpg" width="1280" height="720" alt="" loading="lazy">` (decorative: the button already has an accessible name) filling the 16:9 button with `object-fit: cover`, and a round Play button drawn in CSS in the poster's empty top-right corner (a centred button covered the poster's logo and title when checked), instead of the logo and text. It is a same-origin request, so the page still makes no request to YouTube before a click. The existing click script, plain YouTube link, keyboard behaviour and 320 px layout are unchanged.
7. **The admin page is untouched.** It is private and not meant to be shared; no tags are added there.
8. **Tests:** node tests for `socialMeta` escaping and the landing tags (all tags present, absolute URLs from the given origin, hostile values escaped); workers tests for the payment route (open event shows its name, hostile name escaped, unknown event, closed event and a failing lookup all fall back, page still 200); a check that the JPEG is 1280x720 and under 200 KB; a test that the admin page has no `og:` or `twitter:` tags.
9. **Visual and manual checks:** Playwright at 320 and 390 px, light and dark, for the new video card (poster visible, Play button centred, no overflow, still zero requests to YouTube before the click); the head tags parsed from the live HTML. After deploy, run the real validators (Facebook Sharing Debugger, LinkedIn Post Inspector, X/Telegram preview by pasting the link), which also refreshes their caches.

## Risks / Trade-offs

- **Crawler caches:** platforms cache previews for days; a wrong preview must be refreshed through each platform's debugger. Not testable locally.
- **A database read on every payment page view:** tiny and indexed, and the page already calls the API for the same event right after load; but a database outage now touches the shell too. The lookup is wrapped so the page still serves generic tags.
- **Poster text is small in a 1200px-wide card:** it is the explainer's title frame (logo, title, tagline), legible at preview sizes but not designed for them; a purpose-made 1200x630 card could replace the JPEG later with no code change.
- **16:9, not 1.91:1:** Facebook and LinkedIn may crop a few pixels top and bottom of the poster; the title frame keeps its content well inside.
- **The event name is shown to anyone who gets the link** (as the payment page itself already does).
