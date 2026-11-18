# Atrium: the Meta film (3:00)

A short film for the Meta hackathon. Meta is the hero partner: Meta Quest, hand tracking, WebXR, and Meta's own Immersive Web Emulator (IWER) shown on screen. Aholo is not featured. No voice-over and no TTS: thin blur-in narrator lines carry the story, per `learn.md` (Demo 3 / Day 2 idiom, "much much better than narrated"). English throughout. The words "demo", "fake" and "not real" never appear on screen.

## What we have, checked on 18 Nov 2026

- **The real product in Meta's emulator.** Atrium runs in a real WebXR `immersive-vr` session on IWER 2.8.0 emulating a **Meta Quest 3**: real headset field of view, gaze reticle, emulated tracked hands. A hand pinch drives the app's own `select` event (tested: a pinch on "Begin here" advanced the flow). It renders at 1920×1080, about 57 fps, and records to VP9.
- **Reference track** `vedio/refrance.mp3`: 156 s, **127.75 BPM** (beat 0.470 s, bar 1.879 s), **F major**. Shape:
  - bars 0–2: near-silent intro (−20 dB, no highs);
  - bars 3–12: a sub-heavy build;
  - bars 13–26: a melodic section (low-mid, no sub, offbeat snare);
  - **bar 27 (51 s): the drop**, +5 dB, sub 45%, held through bar 77;
  - bars 41–54: the densest stretch (four-on-the-floor kick, snare and claps on every 16th).

  It reads as a dark, bass-driven trap/EDM bed.
- **`vedio/intro.mp4`**: 9.5 s, 1080p30, a third-party character film (a mouse-helmet DJ, "BLITZ"). **Used for this version only, as you chose; swap it before you submit.**
- **Our art**: about 60 painted assets in `design/art`, the forest palace, 33 GLB models, Lumen, and the UI kit.

## Music: ours, about 85% like the reference

Composed in numpy (`film/music/compose_atrium.py`), measured against the reference with `film/music/ana.py` and `grid.py`, and iterated until each section is within about 2 dB per band.

- **Kept from the reference:**
  - 127.75 BPM;
  - the section shape (quiet intro, sub build, melodic lift, drop at bar 27, a denser second half);
  - the drum density per section;
  - the per-band balance;
  - the loudness ramp.
- **Ours:**
  - D minor instead of F major;
  - our own chords (i–VI–III–VII);
  - a lantern-bell motif;
  - every sound;
  - UI sounds placed on the film's own events (whooshes, clicks, glitch hits, the white-flash impact).
- **Master:** −14 LUFS, −1.5 dBTP.

## Story (one narrator line, small, centred, blur-in)

Times are on the bar grid (1 bar = 1.879 s). The chapters:

| Time | Chapter | Picture |
| --- | --- | --- |
| 0:00–0:09 | **Cold open** | Black. A single lantern lights in the green forest, its glow filling the frame. "ATRIUM" assembles from the lantern's light in serif gold, held, then a **glitch and VFX hit** (RGB split, scanlines, a chromatic tear) on the downbeat. |
| 0:09–0:19 | **intro.mp4** | The clip plays under our bed, then ends in a **cinematic white flash** (an overexposed bloom to white, as you described). |
| 0:19–0:40 | **The pain everyone has** | Out of the white: "You read it. / You highlighted it. / Two days later — gone." The forgetting curve (Ebbinghaus) draws itself and falls; notes, flashcards and highlights fade out on it. "70% of what we learn, gone in a day." (the Ebbinghaus curve, cited on screen). |
| 0:40–0:52 | **The old answer** | "Memory champions never forget. They walk through a palace." A painted rotunda rises from the dark (our art); the method of loci in one line. "It takes years to build one." |
| 0:52 (drop, bar 27) | **Reveal** | "Now it takes one sentence." The Meta Quest 3 headset (outline only, no Meta trademark logo unless you approve one) and "Atrium · for Meta Quest". The camera dives into the lens and **into the real product**. |
| 0:55–2:25 | **The product, recorded in Meta's emulator** | See below. |
| 2:25–2:45 | **Impact** | The numbers visualised (ten elements forwards and backwards in five minutes, a streak counter, lanterns relit). Then "Built for Meta Quest. Hands only. Seated. Offline first." with the hand-tracking skeleton. |
| 2:45–3:00 | **End card** (held 7 s on the outro) | The Atrium mark from the lantern, "Never forget it.", `atrium-b0r.pages.dev`, "Built for Meta Quest · WebXR". |

## The product chapter (all real, recorded on the emulated Quest 3, forest theme only)

The strongest painkiller everyone relates to: **"I need to remember this, in order, for tomorrow."** One story the whole way through: a student with an exam tomorrow and the **12 cranial nerves**.

1. **Pastes the notes** (a real World Builder run via Groq): the line "Paste anything. Walk through it." A cursor clicks Build.
2. **The palace builds itself**: stops fill pedestal by pedestal with real 3D objects, and lanterns light one per beat.
3. **Walking it with hands**: the emulated Quest hand pinches and flicks to turn the ring, with Lumen beside it. This is the frame that says "real VR".
4. **Recall**: "What's number 7?". A pinch on the answer, the lantern blooms gold, and the motifs rise. Then a backwards recall at speed, each answer quicker than the last (fast where speed is the message).
5. **Recall Rush**: a 3-second taste of the game.
6. **Glimpses**, two beats each:
   - the Moonlit and Sakura worlds, flashed and then left again ("three worlds");
   - five languages flipping on one button;
   - the streak flame.

Cursor and hand treatment, per `learn.md`:
- On desktop shots, a large custom cursor with a click ring, eased between targets.
- On Quest shots, the emulated hand with a soft pinch ring at the fingertip.
- The camera follows the work: a slow push on every shot, with a zoom into the pedestal on each recall.

## Production

- **Capture:**
  - a Playwright script drives Atrium on IWER (Quest 3, hands mode) at 1920×1080;
  - every shot is scripted, so reshoots are exact;
  - a canvas MediaRecorder captures to WebM, then ffmpeg brings it to 60 fps constant frame rate;
  - the cursor is not in the capture; it is added in the edit, so it can be cinematic.
- **Edit:** Remotion in `film/`, reusing the motion helpers from the Agentmd films (Words, Glow, Cursor, Glitch, Count). Our palette: deep forest green, gold, ivory, with gold as the one accent.
- **Checks before you see it:**
  - a still sheet every 2 s;
  - 10 fps strips across every transition;
  - `attention.py` (target under 3% still frames, longest still under 0.5 s, no blank frames);
  - loudness −14 LUFS;
  - a full playback with sound.
- **Output:** `film/out/atrium-meta.mp4`, 1080p60, under 100 MB.

## What I need from you

1. Approve this plan (or change the story).
2. **Meta branding:** may I show the Meta Quest name and a headset outline? I will **not** use Meta's logo unless you confirm the hackathon allows it.
3. Confirm the 70% forgetting statistic framing is fine. It cites Ebbinghaus (1885), whose classic curve shows about 66% forgotten after a day.
