# Atrium build status

How every feature was checked. **Tests** are in `tests/` (`npm run test`, 87 passing). **Walkthrough** means a scripted browser run of the real app on desktop (Playwright scripts kept outside the repo), at the stated date. **Live API** means a real call to the named service, not a mock. Nothing here has been run on a Meta Quest yet; every VR-only path says so.

Status: ✅ works end to end · 🟡 built, partly verified · ⬜ not built

## Core learning

| Feature | Status | Verified by |
| --- | :---: | --- |
| First five minutes: the first 10 elements, quick test, exploration walk, encode, recall forwards, backwards, "what's number 7?" | ✅ | Walkthrough (18 Nov): 10 stops placed, 21 graded recalls, deliberate miss recorded. Tests `journeys` |
| Journeys: ordered loci, landmark medallion every 5th stop, recall by direction or position | ✅ | Tests `journeys` (order, positions never adjacent, landmarks, prompts); walkthroughs |
| Rehearse a talk (coverage and order of points) | 🟡 | Test `reports which talk points were covered…`; never run with a real long recording |
| Co-created scenes, spoken or typed twists, gesture signature (DTW), graded recall, FSRS lanterns | ✅ | Tests `gesture matcher`, `grading`, `FSRS model`, `answer matching`; walkthroughs |
| No-backlog sessions, comeback walk, 20-minute stop | ✅ | Tests `session triage` |
| Streaks, freezes, 48-hour repair, weekly mode, milestones and themes | ✅ | Tests `ember streak`, `can repair for 48 hours…`, `milestones and weekly mode` |
| Readiness and goals | 🟡 | MCP `get_readiness` test; the headset shows "if you stop today" only (reviews per day via MCP) |
| Wind-down, gaze-only, captions, larger text | 🟡 | Desktop only; gaze dwell never tried in a headset |

## World Builder and agents

| Feature | Status | Verified by |
| --- | :---: | --- |
| Paste text, a topic, a URL or a PDF → an ordered journey | ✅ | Live API (Groq): "The 12 cranial nerves" → 12 stops in order; a real PDF → 5 steps. Tests `World Builder` (offline drafter, private URLs refused, HTML to text) |
| Walk it in from the inbox (exploration walk, encode, first recall) | ✅ | Walkthrough (18 Nov): topic typed → 8 planets placed and recalled |
| MCP: `add_memories`, `build_palace`, `create_goal`, `list_due`, `get_known`, `get_gaps`, `get_readiness`, `get_journey` | ✅ | Test `lists the eight tools…` (real MCP client) |
| Ask an agent (study agent files 5 facts via the MCP path) | ✅ | Live API (Groq): 5 planet facts in ~9 s |
| Creator palaces: publish a journey, copy by code | ✅ | Test `creator palaces` (personal twists and objects stripped) |
| Teams (shared palace with members) | ⬜ | Not built |

## Aholo / 3D

| Feature | Status | Verified by |
| --- | :---: | --- |
| 26 props as Lux3D models (image-to-3D), painting fallback | ✅ | Live API; every model rendered and inspected; test `3D model baking` |
| Twist-to-3D and leech objects (text-to-3D → retopology → stored) | ✅ / 🟡 | Live API + walkthrough for twists ("a tiny teapot shaped like a lantern" appeared on its pedestal); mocked server tests. The leech flow has not been driven in a walkthrough |
| Silver and gold finishes (material transfer), collection and rarity, finishes on pedestals | 🟡 | Live API (batch in progress: see `src/shared/finishes.json`); tests `collection rarity`; collection preview walkthrough |
| Lumen (text-to-3D → auto-rig → 5 retargeted clips), reactions, quiz | ✅ | Live API; seen in walkthroughs; test `Lumen quiz` and a live Groq quiz |
| Open-to-remember chest (articulation: URDF body + lid on a revolute hinge, rebuilt in three.js) | ✅ | Live API; walkthrough (18 Nov): closed chests on every stop being recalled, lids open on answer |
| Keepsake STL / 3MF export | 🟡 | Code and route exist; never run against the real export API (needs the public deployment) |
| Themed worlds (World generation), home palace (Reality reconstruction), Aholo Viewer | ⬜ | Not built |

## Play and social

| Feature | Status | Verified by |
| --- | :---: | --- |
| Recall Rush (90 s, combo, music, FSRS reviews, weekly best, share clip) | ✅ | Walkthrough: 197 answers scored exactly (21 deliberate misses), clip saved as WebM; tests `Recall Rush rules` |
| Daily challenge and duels (server-scored, server clock, one run per day) | ✅ | Walkthrough in the headset (19/20, ranked); tests `arena` |
| Profiles (heatmap, badges), friends, cheers, leagues | ✅ | Tests `arena`; companion Arena tab checked in the browser |
| Memory Athlete (baseline, 40-day plan, benchmarks) | 🟡 | Walkthrough of the baseline (12/30 recorded); tests `Memory Athlete`. The number and card casts are not built |
| Study rooms (live presence) | ⬜ | Not built |

## Platform

| Feature | Status | Verified by |
| --- | :---: | --- |
| Desktop (mouse, keyboard, typed input) | ✅ | All walkthroughs |
| Meta Quest: hands, pinch, flick, 72 Hz, hands-lost pause | 🟡 | Code paths only. **Not tested on a device** |
| Speech on Quest (record → Whisper on Groq / Gemini) | 🟡 | Test `transcribes a short clip…` (mocked Groq); never run with real audio |
| Room mode (passthrough, immersive-ar) | 🟡 | Code only; shown only where `immersive-ar` is supported; **not tested on a device** |
| Frame guard (hide far scenes, then paintings) | 🟡 | Tests `frame guard`; never triggered on a device |
| Chinese / English | 🟡 | Website, menus, onboarding and journey prompts translated; deeper flows still English. Tests `text wrapping` |
| Abuse limits (per-IP devices, daily caps on paid calls) | ✅ | Tests `speech, caps and abuse limits` |
| Live deployment with database | ⬜ | `/api/health` reports `db: none`: every cloud feature is off on the live site until `DATABASE_URL` is set (`scripts/secrets.sh`) |
