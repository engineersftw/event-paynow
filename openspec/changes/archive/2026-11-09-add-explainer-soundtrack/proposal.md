# Proposal

## Why

The explainer video is silent. A quiet music bed makes it feel finished when it plays on YouTube, while the burned-in captions keep it understandable with the sound off. The music must be free to use, with its licence recorded, and must not add audio files to Git.

## What Changes

- `npm run video` mixes a **free (CC0) music track** under the video: a slice of the track trimmed to the video's length, normalised to a quiet level, with a 2 s fade in and a 3 s fade out, encoded as AAC stereo in the MP4.
- The chosen track and its provenance live in one small file, `scripts/explainer/music.json` (title, creator, source page, direct file URL, licence URL, start offset in seconds). The audio itself is **fetched on demand and cached in the gitignored `out/` folder**; no audio is committed.
- Default track: **"Calm Pills - Relaxing Ambient Music" by Alaeddin Hallak**, published on the Internet Archive under the Creative Commons CC0 1.0 dedication (a named single author; the item's licence metadata is `publicdomain/zero/1.0`). Only the needed ~80 seconds are fetched from the one-hour mix, not the whole 145 MB file.
- `npm run video -- --silent` skips the music (the previous behaviour); if the track cannot be fetched the build **fails with a clear message** rather than quietly producing a silent video.
- `transcript.txt` gains a closing music credit line (CC0 needs none, but it is useful in the YouTube description and records the source).
- Docs: how to change the track, and the licence note.

Out of scope: voice-over, sound effects, per-scene music cues, bundling any audio in the repository, auditioning more than one track.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `explainer-video`: the video has a soundtrack, with a recorded, free-to-use source.

## Impact

- `scripts/explainer/render.mjs` (fetch, cache, mix, `--silent`), new `scripts/explainer/music.json`, a test, README and AGENTS.md. `out/` is already gitignored.
- No change to the Worker, the site, the database or any deploy.
- Needs network access to `archive.org` when the music is first fetched, plus ffmpeg's HTTP input.
