# Tasks

## 1. Sources

- [x] 1.1 `scripts/explainer/captions.json` (scene id, start, end, caption text) and `scripts/explainer/scenes.html`: the storyboard (title, Organizer chapter, Attendee chapter, outro) as time-driven scenes with `window.renderAt(t)`, site-matching look, Telegram-style chat mocks, burned-in captions from the JSON, fictional names and UEN
- [x] 1.2 A sample QR for the QR scenes made with the repo's `renderQrPng` and a fictional UEN, embedded as an image the scenes page can load

## 2. Build

- [x] 2.1 `scripts/explainer/render.mjs` (frames via Playwright at 1920x1080, 30 fps, piped into ffmpeg with no frame files on disk; ffmpeg to H.264 yuv420p with faststart; poster; `captions.srt`; `transcript.txt`) and the `video` npm script; add `out/` to `.gitignore`
- [x] 2.2 Run it: check duration (60 to 90 s) and format with ffprobe, inspect sample frames of every scene, and confirm `git status` shows no generated files

## 3. Test and docs

- [x] 3.1 Node test: every command named in `captions.json` appears in the bot's `/help` text, and the scenes cover both chapters
- [x] 3.2 Update `README.md` (what the video is, `npm run video`, output folder, upload notes for YouTube) and `AGENTS.md`
- [x] 3.3 Run `npm run check`, `npm run build` and the full test suite
