# Design

## Context

`/` currently serves the static `web/public/index.html` placeholder. All other pages are rendered by `src/web/page.ts` through the catch-all Function (`handleWeb`), which already has `env.BOT_USERNAME` and shared theme code (`THEME_EARLY`/`THEME_JS`, logo). Only `/logo.png` and `/vendor/*` bypass the Function (`_routes.json`).

## Goals / Non-Goals

**Goals:** a clear, fast, static-looking intro page with an Add-to-Telegram button, consistent with the other pages.

**Non-Goals:** screenshots, analytics, localisation, any data access or sign-in.

## Decisions

1. **Render from the Function, not a static file.** `renderLandingPage(botUsername)` in `page.ts`, routed for `GET /` in `handler.ts`. The Telegram link then comes from `BOT_USERNAME` (no hard-coded bot name) and the page reuses the theme/CSS constants. Alternative (static HTML with a literal link) duplicates styles and hard-codes the bot name. The placeholder `index.html` is deleted so there is one source of truth for `/`.
2. **No top-bar Sign out on this page.** The landing page is public and reads no session; it only has the logo, title and the theme toggle (a small inline script reusing `THEME_JS` needs `$()` and a `#theme` button).
3. **Content is fixed copy** in the template string: tagline, a four-item feature list, three getting-started steps, the button (shown twice: top and bottom, since the page is short), and a footer line pointing admins to `/web_admin` for their event pages.
4. **Caching:** `Cache-Control: no-store` like the other pages, to keep behaviour uniform (the page is tiny).

## Risks / Trade-offs

- `BOT_USERNAME` is sanitised the same way as the Login Widget attribute (`[A-Za-z0-9_]`) before it goes into the link.
- If the Function is down the root is down too (previously a static file). Accepted: the whole site shares that fate.
