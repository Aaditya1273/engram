# Devpost submission: Meta VR Start Developer Competition 2026

Copy-ready answers for the submission form, plus where a judge can check each claim.

| Field | Answer |
| --- | --- |
| **Submission name** | Atrium |
| **Tagline** (≤140 chars) | Paste anything, walk through it, never forget it: an AI-built memory palace you explore with your hands, seated, in VR. |
| **Track** | Productivity |
| **Division** | New Experience |
| **Build** | WebXR, https://atrium-b0r.pages.dev (Cloudflare Pages). Opens in the Meta Quest browser; no install, account or controllers. |
| **Source** | https://github.com/Aaditya1273/engram |
| **Target launch** | Spring 2027 |

## Description (≈450 words)

**Inspiration.** The science of remembering is settled: spaced, effortful recall works, and the memory palace (method of loci) is what memory champions use. Yet most people quit. Review piles grow after a few missed days, making cards takes longer than the lecture, AI-made cards don't stick because you skipped the work of making them, and building palaces by hand is tedious. Meanwhile AI agents summarise more for us every day, which multiplies what we're expected to know without helping us remember any of it.

**What it does.** Atrium turns anything you need to remember (a chapter, a talk, a list, a PDF, a topic) into an ordered journey through a 3D memory palace. You sit, look and pinch. At each stop the AI drafts three scenes; you pick one and add your own twist, spoken or typed, and the twist can become a real 3D object. You invent a gesture that matches the meaning, and Atrium grades your later recall against your own recording. Each memory is a lantern that visibly dims as you forget it (FSRS-6 scheduling) and blazes again when you recall it. You can walk a journey forwards, backwards or jump to "number seven". Sessions have a fixed length, so nothing piles up.

AI agents can add memories through an MCP server and read back what you know, what you're missing and how ready you are for a goal. A phone companion sends text into the headset's inbox.

**How we built it.** TypeScript, three.js and raw WebXR (hand joints, select-on-pinch, head gaze) built with Vite, so the same link targets Quest and VR Glasses. The pure learning logic (`src/core`: journeys, grading, FSRS, DTW gesture matching, session triage, streaks) is separate from the headset layer and covered by Vitest tests (106 in total, including hands-only input driven through a simulated WebXR session). The backend is one Cloudflare Pages Function on Neon Postgres. It serves the REST API, the MCP server, the World Builder (Groq LLM, URL and PDF import with private-URL blocking) and server speech (Whisper). 3D props, finishes, the coach Lumen and the hinged recall chests were generated with Aholo Lux3D and optimised with glTF-Transform.

**Challenges.** Getting gesture grading to work on wrist paths in the head's yaw frame, keeping a 70° field-of-view layout readable while seated, and making every flow complete without speech, without a controller and without standing.

**What's next.** A full Meta Quest 3 device pass (frame timing, hand-tracking thresholds, microphone), voice commands, an open-palm pause, shared team palaces, and an IWSDK port.

## Hand interactions

Atrium is hands-first end to end and needs no controller:

- **Look + pinch** selects. **Pinch + sideways flick** moves to the next arc of alcoves. **Pinch "Show me"** reveals an answer.
- **Your own gesture is the memory cue.** For each item you perform a gesture that matches its meaning (for *neko*, stroking a cat). We record the wrist path in the head's yaw frame plus five finger curls, and at recall we compare your new attempt with your own recording using dynamic time warping (`src/core/gesture.ts`, tested in `tests/core.test.ts`).
- **Hands lost for more than 2 s pauses**, with a "Show your hands" prompt. Gaze-dwell mode covers people who can't pinch.
- Everything works within a two-foot radius while seated (the airplane seat test).

## Evidence a judge can check

| Claim | Where to check |
| --- | --- |
| It runs | https://atrium-b0r.pages.dev (desktop mouse mode works without a headset) |
| 106 passing tests | `npm ci && npm test`; CI in `.github/workflows/ci.yml` |
| Requirement-by-requirement map to code and tests | [docs/META_INTEGRATION.md](META_INTEGRATION.md) |
| Feature-by-feature status, including what is *not* verified yet | [docs/STATUS.md](STATUS.md) |
| 3D pipeline timings and costs | [docs/AHOLO_API_NOTES.md](AHOLO_API_NOTES.md) |
| MCP server (8 tools) | `server/`, test `lists the eight tools…` in `tests/server.test.ts` |

**Known limits (stated honestly):** Atrium has not yet been run on a physical Meta Quest. All verification so far is on desktop browsers and in scripted walkthroughs.
