# Tasks

## 1. Assets and header

- [x] 1.1 Prepare the supplied logo (`/tmp/claude-1000/-home-miccheng-projects-event-paynow/0e93afd1-a214-5a82-8349-8412a32361d2/images/3.webp`): keep the transparent background (zero any faint alpha outside the icon), crop to the icon, resize to a 128px PNG at `web/public/logo.png`, and check it on light and dark backgrounds; add it to the header (top left, with `alt`, fixed size) and as the page icon
- [x] 1.2 Make the title `Event: <Event Name>` (heading and `document.title`)

## 2. Theme

- [x] 2.1 Restructure the CSS tokens for `data-theme` light/dark plus the system preference when unset; add the head script that applies a saved choice before paint (try/catch)
- [x] 2.2 Add the header toggle button that flips the theme and saves it

## 3. Row polish

- [x] 3.1 Add status colour tokens for light and dark and apply them to payment and payback pills (text kept)
- [x] 3.2 Show the payback count as a prominent chip on the payback button
- [x] 3.3 Enlarge the row action buttons (min 40px height) and keep primary / destructive distinct
- [x] 3.4 Add `fmtDate` (`dd-MMM-YYYY`, local zone, English months) and use it for created and received dates

## 4. Tests and docs

- [x] 4.1 Update `test/node/web-page.test.ts` (header text, toggle, logo path, status classes, `fmtDate` behaviour) and `test/workers/web-admin.test.ts` if needed
- [x] 4.2 Check in a browser at 375px and 1024px in both themes with a stubbed API
- [x] 4.3 Update the web admin sentence in `AGENTS.md`; run `npm run check`, `npm run build` and `npm test`
