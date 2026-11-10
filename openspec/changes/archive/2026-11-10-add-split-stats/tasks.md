## 1. Counters and snapshot

- [x] 1.1 In `src/db/usage-repository.ts` add the split metric constants and `D1UsageRepository.splitSnapshot(now)` (counter totals with 7 and 30 day windows, plus the live counts of remembered people and unexpired waiting QRs)
- [x] 1.2 Add `test/workers/usage-repository` cases (or extend the existing file) for the snapshot: totals, windows, and the live counts excluding expired claims

## 2. Report and command

- [x] 2.1 Add `src/commands/split-stats-handler.ts` with `formatSplitStats(snapshot, now)` (no names or ids, percentages, success rate, "No splits counted yet.", the note that counting started when it shipped) and a node test for it
- [x] 2.2 In `src/split-bot.ts` register the hidden `stats` command with the same ACL as the Event bot (private chat, id on `parseUserIds(env.STATS_USER_IDS)`, no reply otherwise); do not add it to `SPLIT_HELP`

## 3. Counting

- [x] 3.1 Pass an optional `UsageCounter` to `SplitCommandHandler` and `collectClaim`; count at Confirm (confirmed, type, place, someone else paid), per chat QR and per direct message, per receipt scan read or failed, and per waiting QR created and collected, each best effort so a failure never affects the user
- [x] 3.2 Add workers tests: `/stats` for an authorized user, an unauthorized user, a group, and no list (set `STATS_USER_IDS` explicitly); counts after equal, custom and receipt splits; QR and DM counts; scan ok and failed; claim created and collected; counting that throws does not stop the QR

## 4. Docs

- [x] 4.1 Update README (the stats paragraph), `AGENTS.md` and `docs/architecture.md`
- [x] 4.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
