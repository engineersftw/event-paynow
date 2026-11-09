# Tasks

## 1. Music settings

- [x] 1.1 Find a good slice of the default track: fetch a short window from the source, measure its level and silence with ffmpeg, pick a `startSeconds` that is not silent or mid-fade, and write `scripts/explainer/music.json` with title, creator, source page, file URL, CC0 licence URL and the start offset
- [x] 1.2 Node test: `music.json` is complete, uses the CC0 1.0 licence URL and an `https://archive.org/` file URL, and has a non-negative start offset

## 2. Build

- [x] 2.1 In `scripts/explainer/render.mjs`: fetch and cache the slice under `out/explainer/.music-cache/`, mix it in the existing ffmpeg process (loudnorm, 2 s fade in, 3 s fade out, trimmed to the video length, AAC 192k stereo 48 kHz), add `--silent`, and fail with a clear message when the fetch fails without `--silent`
- [x] 2.2 Add the music credit as the last line of `transcript.txt`, from `music.json`
- [x] 2.3 Run the build and measure: AAC stereo stream, audio length equals video length, integrated loudness between -30 and -18 LUFS, fade in and out visible in sampled levels, `--silent` gives a video with no audio stream, `git status` clean

## 3. Docs and verification

- [x] 3.1 Update `README.md` (soundtrack, `music.json`, `--silent`, how to change the track, the licence note) and `AGENTS.md`
- [x] 3.2 Run `npm run check`, `npm run build` and the full test suite
