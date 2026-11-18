# Atrium: the Meta film (3:00, 1080p60)

`out/atrium-meta.mp4`. No voice-over: a thin narrator line carries the story (`learn.md`, the Day 2 / Demo 3 idiom).

## What's real
- **The product chapter is Atrium itself**, in a live WebXR `immersive-vr` session on Meta's Immersive Web Emulation
  Runtime (IWER 2.8) emulating a **Meta Quest 3**, against the local app and API (Groq for the World Builder, Neon for
  the database). `capture/take.mjs` drives it the way a person would: head gaze, then a right-hand pinch (the WebXR
  select event). Nothing on screen is mocked. The tag on screen says so: "Meta Quest 3 · Meta Immersive Web Emulator".
- The palace is the real build of "The 12 cranial nerves" (12 stops), walked in and then recalled 12 of 12 by pinch.
- The forgetting curve is Ebbinghaus's (1885), drawn as an exponential; "most of what we learn is gone within a day".
- **`vedio/intro.mp4` (0:07–0:17) is third-party footage**, used as a placeholder at the owner's choice. Replace it
  before publishing.

## Music
`music/compose_atrium.py` writes the bed and the UI sounds from numpy, to the measured shape of the reference track
(`music/ana.py`, `music/grid.py`): 127.75 BPM, the drop on bar 27, sub-heavy drops, a sub-less melodic section and
outro. Ours: D minor, Dm–B♭–F–C, the lantern-bell motif, every sound.

## Rebuild
1. `npm run dev` in the repo (port 5179), then `cd capture && npm i iwer && node take.mjs` (about 9 minutes).
2. Convert each `capture/clips/<take>.webm` to 60 fps H.264 in `public/clips/`, copy the `.json` logs to `src/marks/`.
3. `~/TY/.venv/bin/python3 music/compose_atrium.py public/audio`, art into `public/art/` (see the commit).
4. `npm run render`, then normalise to −14 LUFS (ffmpeg `loudnorm`).
