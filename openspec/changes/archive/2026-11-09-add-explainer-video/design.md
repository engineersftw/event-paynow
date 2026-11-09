# Design

## Context

Playwright (a devDependency) with a headless Chromium and ffmpeg with `libx264` are available. There is no text-to-speech tool, so the video is silent and captioned. The owner uploads the result to YouTube by hand, so nothing in the repo or on the site needs to serve the file.

## Goals / Non-Goals

**Goals:** a ~75 s two-chapter explainer, reproducible from the repo, with YouTube-friendly companion files, and no generated binary in Git.

**Non-Goals:** voice-over, music, translations, uploading, serving the video from the site, embedding it on the landing page.

## Decisions

1. **Scenes are one HTML page with a deterministic timeline**, `scripts/explainer/scenes.html`: scenes with start and end times, CSS-only look matching the site (logo, same colour tokens, dark theme), Telegram-style chat mocks for the bot conversations, the sample QR for the QR scenes, and burned-in captions. It exposes `window.renderAt(t)` that sets every animation to time `t` (no real-time clocks), so each frame is reproducible.
2. **Caption text lives in one data file**, `scripts/explainer/captions.json` (scene id, start, end, text), read by both the scenes page and the render script, so the burned-in captions, `captions.srt` and `transcript.txt` can never disagree.
3. **Render script** `scripts/explainer/render.mjs`: opens the page at 1920x1080, calls `renderAt(t)` for each frame at 30 fps, JPEG screenshots piped straight into ffmpeg's stdin (no frame files on disk at all), `ffmpeg -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart` into `out/explainer/explainer.mp4`, and writes `poster.png`, `captions.srt` and `transcript.txt` beside it. `npm run video` runs it; the temp frames are deleted afterwards. 1080p and CRF 20 favour quality because there is no size limit (YouTube re-encodes anyway).
4. **`out/` is added to `.gitignore`** (checked first that nothing else uses that name), so the output cannot be committed by accident.
5. **Sample QR from the repo's own renderer** (`renderQrPng` via `tsx` at render time), using a **fictional UEN** (`201900000A`) and the names "Alex" and "Sam", never a real number, so the picture matches what the bot sends.
6. **Storyboard (about 75 s):** title (4 s); Organizer chapter: create the event with `/init` (8 s), share the payment page with `/web_payment` or issue a QR with `/start` (9 s), tap Received (7 s), Check-In by scanning or tapping on the row (9 s), `/payback` (7 s); Attendee chapter: the QR or link arrives (7 s), pay in a banking app (8 s), keep the QR and show it at the door (8 s); outro with "Add the bot on Telegram" (6 s).
7. **Accuracy test (node):** every command in `captions.json` appears in the bot's `/help` text, so the captions cannot silently name a command that no longer exists. The test reads the JSON only; it does not render.

## Risks / Trade-offs

- **The video goes stale** when the bot changes: it is only as current as the last `npm run video`. The test catches renamed commands, not changed looks.
- **Nothing is backed up in the repo:** the MP4 exists only on the machine that built it and on YouTube. Re-running the script recreates it, which is the point of keeping the sources.
- **Rendering depends on fonts and Chromium** on the machine, so a different machine may differ slightly.
- **Rendering time:** about 2,250 screenshots at 1080p; expected to take a few minutes, and it is run by hand, never in CI.
- **No sound:** viewers may expect narration. Captions, `captions.srt` and the transcript cover the content; a voice-over can be added later with ffmpeg.
- The caption wording is a first draft and needs the owner's review before it is uploaded.
