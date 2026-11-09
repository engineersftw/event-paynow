## MODIFIED Requirements

### Requirement: One command builds the explainer video

The system SHALL provide a single command (`npm run video`) that renders the explainer video as an H.264 MP4 at 1920x1080 with captions burned into the picture, so it is understandable with the sound off, and with a music soundtrack in the same file. It SHALL also write a poster still, a captions file (`captions.srt`) and a plain-text transcript, all taken from the same caption text, into one output folder.

#### Scenario: Building the video

- **WHEN** a developer runs the command on a machine with the headless browser and ffmpeg installed
- **THEN** the output folder contains the MP4, the poster, `captions.srt` and `transcript.txt`

#### Scenario: Length

- **WHEN** the video is rendered
- **THEN** it runs between 60 and 90 seconds

#### Scenario: Plays everywhere

- **WHEN** the MP4 is opened in a browser, on iOS or uploaded to YouTube
- **THEN** it plays (H.264 video, yuv420p pixels, AAC stereo audio, metadata at the start of the file)

#### Scenario: Soundtrack present

- **WHEN** the command finishes without the silent option
- **THEN** the MP4 has an audio stream as long as the video

#### Scenario: Silent build

- **WHEN** the developer runs the command with the silent option
- **THEN** the video is built without an audio stream and no music is fetched

## ADDED Requirements

### Requirement: The soundtrack is free to use and its source is recorded

The system SHALL use only a music track published under the Creative Commons CC0 1.0 dedication, SHALL record its title, creator, source page, file URL, licence URL and start offset in one file in the repository, and SHALL name it in the closing line of `transcript.txt`. The audio file itself SHALL NOT be committed: it is fetched when needed and cached in the ignored output folder.

#### Scenario: Provenance on record

- **WHEN** a maintainer opens the music settings file
- **THEN** it names the track, its creator, the source page, the licence URL (CC0 1.0) and the start offset

#### Scenario: Audio stays out of Git

- **WHEN** the video has been built with music
- **THEN** `git status` shows no new or changed files

#### Scenario: Music credit in the transcript

- **WHEN** `transcript.txt` is written
- **THEN** its last line credits the track and its creator and states the licence

#### Scenario: Track cannot be fetched

- **WHEN** the music file cannot be downloaded and the silent option was not used
- **THEN** the build fails with a message saying so, and no silent video is written in its place

### Requirement: The soundtrack is a quiet bed under the captions

The system SHALL trim the track to the video's length, normalise it to a quiet level, fade it in over the first 2 seconds and out over the last 3 seconds, so it never overpowers the captions or ends abruptly.

#### Scenario: Fades

- **WHEN** the finished video is analysed
- **THEN** its audio level rises from silence over the first 2 seconds and falls to silence by the end

#### Scenario: Level

- **WHEN** the finished video's loudness is measured
- **THEN** it is between -30 and -18 LUFS integrated
