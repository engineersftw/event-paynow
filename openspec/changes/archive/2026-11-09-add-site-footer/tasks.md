# Tasks

## 1. Footer

- [x] 1.1 Add `FOOTER_HTML` and `FOOTER_CSS` (with the LinkedIn and GitHub URLs as named constants) to `src/web/page.ts`
- [x] 1.2 Use them in `renderLandingPage`, `renderPage` (event admin) and `renderPayerPage`: the CSS in each page's `<style>`, the footer after the content and before the script

## 2. Tests

- [x] 2.1 Node tests in `test/node/web-page.test.ts`: each of the three pages has the footer text and both links with `target="_blank"` and `rel="noopener noreferrer"`, the footer loads nothing (no `src`, no script inside it), and it comes after the main content

## 3. Docs and verification

- [x] 3.1 Update `README.md`, `docs/architecture.md` and `AGENTS.md` (every web page has the attribution footer; change the links in `page.ts`)
- [x] 3.2 Check all three pages with Playwright at 320 px and 390 px, light and dark (footer readable, no horizontal overflow, nothing hidden behind it); run `npm run check`, `npm run build` and the full test suite
