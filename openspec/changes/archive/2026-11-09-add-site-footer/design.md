# Design

## Context

`src/web/page.ts` builds three HTML pages as template strings: `renderLandingPage`, `renderPage` (event admin) and `renderPayerPage`. They already share constants (`TOPBAR_HTML`, `TOPBAR_CSS`, `THEME_EARLY`, `THEME_JS`, `ME_*`, `KEEP_QR_REMINDER`) and the same colour tokens (`--muted-fg`, `--border`). The three bodies end with a `<script>` block before `</body>`. Git remote: `engineersftw/event-paynow`.

## Goals / Non-Goals

**Goals:** one footer, defined once, on every page; readable in both themes; no third-party requests.

**Non-Goals:** a link for "Claude Code AI", a licence line or year, footers on JSON or image responses.

## Decisions

1. **One shared constant pair in `page.ts`:** `FOOTER_HTML` = `<footer class="site-footer">Built by <a href="https://linkedin.com/in/miccheng" target="_blank" rel="noopener noreferrer">Michael Cheng</a> &amp; Claude Code AI. <a href="https://github.com/engineersftw/event-paynow" target="_blank" rel="noopener noreferrer">Open Source</a> with ❤️.</footer>` and `FOOTER_CSS` (small, muted, centred, top margin, link colour inherits and underlines, so it works in both themes). The two URLs are named constants next to it, so changing a link is one edit.
2. **Placement:** `${FOOTER_HTML}` is placed after the page content and before the `<script>` block of each of the three pages; `${FOOTER_CSS}` is added to each page's `<style>`. The admin page's "not allowed" and signed-out states live inside the same document, so they get the footer too.
3. **Wording as requested** ("Built by Michael Cheng & Claude Code AI. Open Source with ❤️."), with "Open Source" as the repository link. The heart is the emoji character in the HTML, which the pages already serve as UTF-8.
4. **Styling:** `font-size:13px; color:var(--muted-fg); text-align:center; margin:32px 0 8px`, links `color:inherit; text-decoration:underline`, so there is nothing theme-specific to maintain. Text wraps naturally at 320 px.
5. **Tests (node):** each of the three pages contains the footer text, both URLs with `rel="noopener noreferrer"` and `target="_blank"`, and the footer contains no `src=` and no `<script`; a check that the footer comes after the main content.
6. **Visual check:** Playwright at 320 px and 390 px, light and dark, on all three pages.

## Risks / Trade-offs

- The admin page's content area can be long; the footer sits at the end of the document, not fixed to the screen, so it never covers the Check-In dialog or the QR panels.
- "Claude Code AI" is plain text by request; it can be linked later with one edit.
- A hard-coded repository URL would go stale if the repository moves; it is one constant.
