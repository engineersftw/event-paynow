# Tasks

## 1. Data and validation

- [x] 1.1 Add `website_url` (nullable text) to `events` in `src/db/schema.ts`, generate `0001_event_website` with `npm run db:generate -- --name event_website` (format `drizzle/meta` with Biome), add the column to the test schema in `test/workers/harness.ts` and to `test/node/migration.test.ts`
- [x] 1.2 `Event.websiteUrl` (`string | null`), optional `websiteUrl` on `createEvent`, `EventPatch.websiteUrl` (null clears) and the Drizzle mapping in `src/db/repository.ts` and `drizzle-repository.ts`
- [x] 1.3 `src/commands/website-url.ts` with `normalizeWebsiteUrl()` as designed (http and https only, host with a dot, no credentials or spaces, at most 200 characters, `https://` added when there is no scheme)

## 2. Bot commands

- [x] 2.1 `/init`: new step 4 asking for the optional website (typed address or `init_skip_website:<userId>` Skip, invalid input re-prompts), Confirm and Cancel move to step 5, the context carries `websiteUrl`, and the confirmation summary and success message show `🔗 Website: <url>` when set
- [x] 2.2 `/edit_event`: a Website field (button, prompt with Clear when set, validation through `normalizeWebsiteUrl`, save through `updateEvent`), and the reply lists all final values including the website or "none", marking the changed field

## 3. Web pages

- [x] 3.1 Add `websiteUrl` to the `event` object returned by `eventData` and `payerData` in `src/web/handler.ts`
- [x] 3.2 Both pages: a hidden "Event website:" line under the title; the script reveals it only for an `http` or `https` value, built with `textContent` and `setAttribute`, showing the host, `target="_blank"` and `rel="noopener noreferrer nofollow"`; the payment page also shows it for a closed event

## 4. Tests

- [x] 4.1 Unit tests for `normalizeWebsiteUrl` (accepted and rejected inputs listed in the design)
- [x] 4.2 Update the existing `/init` tests for the extra step and add website tests (set, skip, invalid re-prompt, no scheme, cancel stores nothing, summary and success message); `/edit_event` tests (set, clear, invalid rejected, final values shown)
- [x] 4.3 Repository tests (create with and without a website, update, clear, existing rows read as null) and web tests (admin and payer JSON carry `websiteUrl`; the pages build the link only for http and https values with the safe `rel`, hidden by default)

## 5. Docs and verification

- [x] 5.1 Update `README.md` (the `/init` and `/edit_event` descriptions), `AGENTS.md` (the `/init` flow now has five steps and the new column) and `docs/architecture.md`
- [x] 5.2 Check both pages with Playwright at 320 px and 390 px, light and dark, with and without a link (no overflow) and that a stored `javascript:` value is not turned into a link; run `npm run check`, `npm run build`, the full test suite and `openspec validate --specs`
