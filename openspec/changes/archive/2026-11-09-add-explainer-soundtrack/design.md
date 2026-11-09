# Design

## Context

`scripts/explainer/render.mjs` pipes JPEG frames into one ffmpeg process that writes `out/explainer/explainer.mp4` (video only). The Internet Archive serves files over HTTP with range support, and ffmpeg can read an `http(s)` MP3 input and seek to an offset without downloading the whole file. FreePD (the usual CC0 site) is closed, and the archive's CC0 "happy background music" collections are uploaded by an aggregator whose tracks have unclear original authors, so they are not used.

## Goals / Non-Goals

**Goals:** a free, clearly licensed, quiet music bed; provenance in the repo; no audio in Git; a clear failure instead of a silently silent video.

**Non-Goals:** voice-over, sound effects, per-scene cues, shipping audio in the repo, choosing between many tracks.

## Decisions

1. **Provenance file** `scripts/explainer/music.json`: `{ title, creator, sourcePage, url, licenseUrl, startSeconds }`. The default is "Calm Pills - Relaxing Ambient Music" by Alaeddin Hallak, item `CalmPills` on archive.org, licence `http://creativecommons.org/publicdomain/zero/1.0/`, one of the single-author hour-long mixes ("Calm Pill 1 - Still Habitat"; not a "guest mix", whose contents come from other artists). Changing the track means editing this file.
2. **Fetch only what is needed.** Before the render, the script cuts `startSeconds` .. `startSeconds + total + 4` out of the remote MP3 with `ffmpeg -ss <start> -i <url> -t <len> -c copy` (or re-encode to WAV) into `out/explainer/.music-cache/<hash>.mp3` (ignored by Git because it is under `out/`). The cache key includes URL, start and length, so a re-run with the same settings does not touch the network.
3. **Mix in the same final encode.** The video is already one ffmpeg process fed by frames; the music is added as a second input with an audio filter chain: `loudnorm=I=-23:TP=-2:LRA=7` (quiet, even level), `afade=t=in:d=2`, `afade=t=out:st=<total-3>:d=3`, `atrim=0:<total>`; output `-c:a aac -b:a 192k -ar 48000 -ac 2` with the existing `-movflags +faststart`. One pass, no second re-encode of the video.
4. **Silent option and failure.** `npm run video -- --silent` skips fetching and mixing. If the fetch fails and `--silent` was not given, the script exits non-zero with "Could not fetch the music track (<url>). Check the network, or run with --silent." and writes no MP4.
5. **Credit line.** `transcript.txt` gets a last line: `Music: <title> by <creator> (CC0 1.0), <sourcePage>`, from the same JSON, so the YouTube description records the source even though CC0 does not require it.
6. **Test (node):** `music.json` is complete, the licence URL is the CC0 1.0 dedication, the file URL is an `https://archive.org/` download link, and the start offset is a non-negative number. A render is not part of the tests (no network, no ffmpeg in CI).
7. **Verification by measurement:** after a build, `ffprobe` shows an AAC stereo stream whose duration matches the video, `ffmpeg ... ebur128` reports the integrated loudness in the -30 to -18 LUFS range, and sampled short-term levels show the fade in and out.

## Risks / Trade-offs

- **The track has not been auditioned by me.** The mood (soft ambient piano) comes from its description and I cannot listen. The owner must listen to the result and, if it is wrong, change `url` / `startSeconds` in `music.json`.
- **Ambient, not upbeat.** A calm bed suits a how-to video, but it is not the lively corporate sound of many explainers.
- **Licence rests on the uploader's CC0 statement** on the Internet Archive. A single named creator makes that more credible than an aggregator upload, but it is not a guarantee, and YouTube's Content ID can still occasionally flag very generic ambient audio.
- **Network dependency:** the first build needs `archive.org`; later builds use the cache.
- **Start offset:** a slice from an hour-long mix might begin mid-phrase; the 2 s fade-in softens this and the offset is tunable.
