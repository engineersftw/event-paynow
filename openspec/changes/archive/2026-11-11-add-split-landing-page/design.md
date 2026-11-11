## Context

The Pages project has one catch-all Function (`web/functions/[[path]].ts`) that calls `handleWeb()`; the home page is `renderLandingPage(botUsername, origin)` in `src/web/page.ts`, built from shared pieces (theme CSS and script, `FOOTER_HTML`, `socialMeta`). Pages vars come from `web/wrangler.toml` (`BOT_USERNAME` today). `_routes.json` sends everything to the Function except named static assets.

## Decisions

**Same site, a new route.** `handleWeb` serves `/split` and `/split/` with `renderSplitLandingPage(splitUsername, origin)`, like `/`: HTML, `Cache-Control: no-store`. No session, no D1 read. When `env.SPLIT_BOT_USERNAME` is empty or missing the route answers 404 (the same rule the bots use until configured), and the home page link is left out.

**One new Pages variable.** `SPLIT_BOT_USERNAME = "Split_PayNow_Bot"` in `web/wrangler.toml` (the Worker already has the same value as a var for its own use). `WebEnv` gains it as optional so the Function types and existing tests keep working.

**Reuse the shell, not the copy.** `renderSplitLandingPage` reuses the existing CSS tokens, `THEME_EARLY`, `THEME_JS`, `FOOTER_CSS` and `FOOTER_HTML`, so the theme choice is shared and the footer is identical. To avoid copying the base styles of the home page, the shared parts of `renderLandingPage` (base CSS, top bar, head) are lifted into small helpers used by both pages; the home page output stays byte-for-byte the same apart from the new link. No video script on the Split page, and no external request of any kind (a test asserts the HTML has no `http` references other than the Telegram link, the footer links and the page's own meta URLs).

**Content, plain and literal.** Sections: the headline and CTA; "What it does" (four bullets: equal split with one QR, custom amounts with @mentions and direct-message QRs, receipt scan, group claiming with pay-now); "How a split goes" (an ordered list: payee and whether it is you, the bill, how to share it, summary and Confirm; QRs); "Get started" (`/split`, `/split_custom`, `/split_receipt`, add to a group); "What it keeps" (nothing beyond the conversation, receipt photos never stored, mentioned usernames and waiting QRs kept briefly, `/forget`); a closing CTA and a link home. All text is static, so nothing from a request is echoed except the bot username, which is stripped to `[A-Za-z0-9_]` exactly as the home page does.

**Logo.** The supplied image (1254x1254, transparent corners, 149 KB) is too large for a 56 px header, so a 128x128 PNG (about 25 KB, the size of the existing `web/public/logo.png`) is made from it with Pillow and committed as `web/public/split-logo.png`; the header `<img>` and the tab `<link rel="icon">` of the Split page point to it, and `_routes.json` excludes it from the Function. The full-size source is not committed: the preview script reads it from a path argument, and the 128 px file is regenerated the same way if it ever changes.

**Preview image.** `socialMeta` gets an optional `imageAlt` (default the existing explainer alt) so the Split page can describe its own image. `scripts/generate-split-preview.mjs` renders a small HTML card (the logo at a large size from the source image given as an argument, "Split PayNow Bot", a line about splitting bills with QRs) with the pre-installed Playwright at 1280x720 and writes `web/public/split-preview.jpg` (quality chosen to stay well under 200 KB). The script is run by hand and the JPEG committed, like the explainer poster; `_routes.json` excludes `/split-preview.jpg` from the Function.

**Home page link.** One small paragraph under the first button: "Splitting a bill? Try the Split PayNow Bot", linking to `/split`, shown only when the Split username is configured. `renderLandingPage` takes the optional username as a third argument.

## Risks

- A wrong or missing Pages variable hides the page and the link rather than showing a broken button; the 404 makes that visible.
- The preview image is a static asset: a changed bot name or tagline needs the script re-run.
- The page promises things the bots do; the content tasks include checking each claim against the README.
