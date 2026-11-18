# Atrium build status

How every feature was checked. **Tests** are in `tests/` (`npm run test`, 93 passing). **Walkthrough** means a scripted browser run of the real app on desktop (Playwright scripts kept outside the repo), at the stated date. **Live API** means a real call to the named service, not a mock. Nothing here has been run on a Meta Quest yet; every VR-only path says so.

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
| Choose your world on day one (Garden, Moonlit, Sakura); the other two open at 7 days, Golden hour at 365; start over in a closed world (streak back to day 1, memories kept, synced to the server) | ✅ | Tests `opens your own world…`, `starts the streak over at day 1…`; walkthrough (18 Nov): first-run choice and preview, free switching at 12 days, start over at 3 days |
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
| Twist-to-3D and leech objects (text-to-3D → retopology → stored) | ✅ / 🟡 | Live API + walkthrough for twists ("a tiny teapot shaped like a lantern" appeared on its pedestal); on production "a small brass compass" was ready in 118 s and stored in Neon; mocked server tests. The leech flow has not been driven in a walkthrough |
| Silver and gold finishes (material transfer), collection and rarity, finishes on pedestals | 🟡 | Live API (batch in progress: see `src/shared/finishes.json`); tests `collection rarity`; collection preview walkthrough |
| Lumen (text-to-3D → auto-rig → 5 retargeted clips), reactions, quiz | ✅ | Live API; seen in walkthroughs; test `Lumen quiz` and a live Groq quiz |
| Open-to-remember chest (articulation: URDF body + lid on a revolute hinge, rebuilt in three.js) | ✅ | Live API; walkthrough (18 Nov): closed chests on every stop being recalled, lids open on answer |
| Theme scenery (the whole room: marble, floor, banners, captions and buttons follow the world): Sakura (pale blush marble, two blossom valleys, blossom vines), Moonlit (midnight-blue stone, torii-red banners, shrine lake, blossom vines, 3D sakura pagoda lanterns from Lux3D image-to-3D, 4.2k triangles each) | ✅ | Walkthrough (18 Nov): both themes and the garden rendered, lanterns lit and unlit, no console errors. Not seen on a Quest |
| Keepsake STL / 3MF export | ✅ | Production (18 Nov): a generated compass exported as a 253 KB `printable.stl` via Lux3D multi-format export (1 credit); test `exports a printable STL…` |
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
| Speech on Quest (record → Whisper on Groq / Gemini) | 🟡 | Production round trip to Whisper works (a silent clip); Whisper's stock silence phrases ("Thank you.") are discarded. Not yet run with real spoken audio or on a Quest |
| Room mode (passthrough, immersive-ar) | 🟡 | Code only; shown only where `immersive-ar` is supported; **not tested on a device** |
| Frame guard (hide far scenes, then paintings) | 🟡 | Tests `frame guard`; never triggered on a device |
| Chinese / English | 🟡 | Website, menus, onboarding and journey prompts translated; deeper flows still English. Tests `text wrapping` |
| Abuse limits (per-IP devices, daily caps on paid calls) | ✅ | Tests `speech, caps and abuse limits` |
| Live deployment with database | ✅ | Neon Postgres attached; production `/api/health` = `db: postgres, ai, stt, lux3d` all on. Production smoke test (18 Nov): device, sync, profile, World Builder (topic and a Wikipedia URL: all 13 cranial nerve entries), study agent, Lumen quiz, twist mapping, transcription round trip, daily challenge, duel, league, twist-to-3D (ready in 118 s, 454 KB GLB served), STL export; the app loads with no console errors |
