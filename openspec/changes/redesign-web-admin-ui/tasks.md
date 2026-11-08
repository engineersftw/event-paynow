# Tasks

## 1. Design tokens and components

- [x] 1.1 Replace the inline `<style>` in `renderPage` (`src/web/handler.ts`) with shadcn-style CSS variables (light and dark via `prefers-color-scheme`) and card, badge, button, input and dialog classes; mobile first, no horizontal scroll at 375px
- [x] 1.2 Rebuild the shell: header with event name and "New request" button, three stat cards for the totals, a list container, sign-in and message areas

## 2. Payment list

- [x] 2.1 Render each payment as a compact card row (payer name, amount and net, status badge, created time; no description, the event name is in the header) built with `textContent`
- [x] 2.2 Add the "Paybacks · N" indicator button (`aria-expanded`) on rows with paybacks or remaining amount; expanding shows payback rows, QRs of pending paybacks, Sent / Cancel and the pay back form; no indicator otherwise
- [x] 2.3 Add the pending indicator button on pending rows; creating the QR `<img>` only when expanded, with Received and Void buttons; no payment QR requested on load
- [x] 2.4 Keep expanded refs in memory so reloads after an action keep rows open; expand the payment after creating a payback

## 3. Payment request dialog

- [x] 3.1 Move the payer, name and amount fields into a native `<dialog>` opened by "New request" (hidden for closed events); Escape, close button and backdrop tap close it; errors shown inside with values kept
- [x] 3.2 After a successful create show the QR, details and posted / not posted line in the dialog with "Done" and "Create another"; refresh the list behind it

## 4. Tests and docs

- [x] 4.1 Update `test/node/web-page.test.ts` for the new markup (dialog, indicators, lazy QR, still no `innerHTML` or `<form>`, script syntax check)
- [x] 4.2 Check the page in a browser (Playwright screenshots at 375px and 1024px, light and dark) with a stubbed API
- [x] 4.3 Update the web admin sentence in `AGENTS.md` and the README page description if it mentions the layout
- [x] 4.4 Run `npm run check`, `npm run build` and `npm test`
