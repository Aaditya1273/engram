<div align="center">
<img width="2170" height="725" alt="Golden Atrium" src="https://github.com/user-attachments/assets/0ca0af95-4438-4bca-b4f1-8d3501103cdd" />

# Atrium

### Paste anything. Walk through it. Never forget it.

**A memory superpower for Meta Quest, Meta VR Glasses and the browser.**
Atrium's AI turns anything you need to remember (a chapter, a talk, a list, a PDF) into an ordered journey through a 3D memory palace, the method memory champions use. Walk it forwards, backwards, or straight to number seven. Every memory is a real 3D object; the things you name become objects of their own.

`Productivity track` · `New Experience division` · `Meta VR Start Developer Competition 2026`

[Run it](#getting-started-developers) · [Demo video](#demo) · [Architecture](#architecture) · [MCP server](#mcp-server-for-ai-agents) · [Research](#research-foundation)

</div>

> **Build status (18 Nov 2026):** journeys and the elements onboarding, the World Builder, Lumen, Recall Rush, the collection, the arena (daily challenge, duels, friends, leagues), Memory Athlete, creator palaces, Chinese/English and the Aholo Lux3D 3D pipeline are built and tested on desktop: **87 unit and integration tests** plus scripted browser walkthroughs. **Not yet:** a Meta Quest device pass, the production database (cloud features are off on the live site), themed worlds and home reconstruction, study rooms. The full, honest table is in **[docs/STATUS.md](docs/STATUS.md)**; Aholo timings and credit costs are in **[docs/AHOLO_API_NOTES.md](docs/AHOLO_API_NOTES.md)**.

---

## Table of contents

- [Why Atrium](#why-atrium)
- [What makes it different](#what-makes-it-different)
- [Demo](#demo)
- [Try it (for judges)](#try-it-for-judges)
- [How it works](#how-it-works)
- [Controls](#controls)
- [Features in detail](#features-in-detail)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started (developers)](#getting-started-developers)
- [Environment variables](#environment-variables)
- [MCP server for AI agents](#mcp-server-for-ai-agents)
- [Data model](#data-model)
- [Algorithms](#algorithms)
- [Design rules for VR Glasses](#design-rules-for-vr-glasses)
- [Accessibility](#accessibility)
- [Performance budget](#performance-budget)
- [Privacy and security](#privacy-and-security)
- [Research foundation](#research-foundation)
- [Roadmap](#roadmap)
- [Competition submission](#competition-submission)
- [Contributing](#contributing)
- [License and credits](#license-and-credits)

---

## Why Atrium

The science of remembering is settled: spaced, effortful recall works. Yet most people who start a memory system quit. Four problems cause it:

| Problem | What happens |
| --- | --- |
| **The review pile** | Skip a few days of spaced repetition and hundreds of cards are waiting. This is the most common reason people quit. |
| **Making cards** | Writing good cards takes longer than the lecture they come from. |
| **AI cards don't stick** | When AI makes the cards, you lose the learning that making them gave you. |
| **Building palaces is tedious** | The memory palace works, but people tire of constructing new ones and run out of places. |

AI agents now find and summarise everything for us. That multiplies what we're expected to know without helping us remember any of it.

**Atrium is where your hands write memories and your agents learn what you know.**

---

## What makes it different

| | Atrium | Flashcard apps | Other VR memory palaces |
| --- | :---: | :---: | :---: |
| Remembers **order**: lists, steps, talks, forwards, backwards and by position | ✅ | ❌ | ✅ (hand-built) |
| AI builds the palace from your own material | ✅ | ❌ | ❌ |
| You co-create each mnemonic (AI drafts, you decide) | ✅ | ❌ | ❌ |
| A gesture you invent, graded against your own recording | ✅ | ❌ | ❌ |
| Memories visibly dim as you forget them | ✅ | ❌ | ❌ |
| Fixed-length sessions that never pile up | ✅ | ❌ | ❌ |
| AI agents can add memories **and** read what you know | ✅ | ❌ | ❌ |
| Controller-free, seated, built for a 70° field of view | ✅ | n/a | ❌ |

---

## Demo

> 📺 **Demo video (2:30):** `<YouTube or Vimeo link>`
>
> All footage is real headset or emulator capture.

| First five minutes | Daily session | Agent capture |
| --- | --- | --- |
| `docs/media/first-five.gif` | `docs/media/daily-session.gif` | `docs/media/agent-capture.gif` |

---

## Try it (for judges)

> **Live:** https://atrium-b0r.pages.dev (Cloudflare Pages). The palace, the 3D prop library and the first five minutes run fully, on a computer or a headset; cloud features (twist-to-3D, server speech, the study agent, capture, inbox, companion, MCP) switch on once a database is attached; see [Deploy](#deploy-cloudflare-pages--neon).

Atrium runs in the Meta Quest browser. No install, no controllers and no account needed.

1. Put on a **Meta Quest 3 or 3S** and sit down.
2. Open the browser and go to **`atrium-b0r.pages.dev`**.
3. Press **Enter VR**, put the controllers down and raise your hands.
4. Follow the narrator. In about five minutes you'll learn six Japanese words and recall them.
5. **To try capture and agents:** in the headset open **Settings → Connect phone**. On a phone or laptop open **`atrium-b0r.pages.dev/companion.html`** and type the 6-letter code (the QR works when the headset view is cast). Paste a list (for example *"CN I – olfactory"*, one per line) and watch **Inbox** appear in the headset within ~15 s. Under **Agents**, create a key and paste the MCP config into any MCP client.

> **If hands aren't detected:** hold both hands in front of the headset for two seconds. If tracking still doesn't start, pinch once or restart the headset. This is a known Quest wake-from-sleep issue.

---

## How it works

```mermaid
flowchart LR
    A[Capture<br/>voice · phone · agent] --> B[Draft<br/>AI proposes 3 scenes]
    B --> C[Co-create<br/>pick one + add your twist]
    C --> D[Encode<br/>invent your gesture]
    D --> E[Place<br/>alcove in your palace]
    E --> F[Fade<br/>lantern dims with forgetting]
    F --> G[Recall<br/>say it + perform it]
    G -->|correct| H[Relight<br/>lantern blazes, interval grows]
    G -->|missed| I[Repair<br/>replay scene, retry later]
    H --> F
    I --> F
```

**A memory is born in about 20 seconds:**

1. **Capture.** Say *"remember this…"* in the headset, scan a QR code to send text from your phone, or let an agent send it.
2. **Draft.** Atrium's agent extracts the facts and proposes **three vivid scenes** built from the prop kit, each with a one-line mnemonic.
3. **Co-create.** Pinch the scene you like and add one personal detail by voice (*"make the cat wear my grandmother's glasses"*).
4. **Encode.** The narrator suggests a gesture that matches the meaning. You perform your own version twice, and Atrium records it as that memory's **gesture signature**.
5. **Place.** The scene settles into the next free alcove and its lantern lights at full brightness.

From then on the lantern dims along the memory's forgetting curve. A daily **7-minute session** relights the memories that are fading fastest and matter most for your goal.

---

## Controls

| Action | Hands | Gaze-only mode | Voice |
| --- | --- | --- | --- |
| Select | Look + pinch | Look + dwell 1 s | *(planned)* |
| Next arc of alcoves | Pinch + flick sideways | Dwell on edge arrow | *(planned)* |
| Answer a recall | Say the answer + perform your gesture | Say the answer | Say the answer |
| Reveal | Pinch "Show me" | Dwell "Show me" | |
| Pause | Leaving the headset view pauses; hands lost > 2 s pauses | | |

**Desktop:** the mouse points (a gem cursor, and a pointing hand over anything you can press), click selects, arrow keys turn the room, Esc pauses, and gestures are mouse paths. **Type my own** lets you type a twist instead of saying it. Lanterns lean toward a nearby cursor like a magnet and swing home when you move away.
**No speech recogniser?** On the Quest browser your answer is recorded and transcribed by the server. With no recogniser and no server (or no microphone), recall switches to three pinchable answers, still graded and never self-rated.

No action ever needs a controller, standing up, or turning your body. *(Planned: pull-to-inspect, open-palm pause, voice commands.)*

---

## Features in detail

### 1. Co-created mnemonics
The AI does the slow part; you do the part that makes it stick. You get three scene options as structured JSON (props, positions, mnemonic). You pick one and speak a twist, which the agent maps onto props and colours from the kit. If you skip the twist three times in a row, Atrium asks one quick personal question instead.

### 2. Gesture signature
You invent a gesture that matches each memory's meaning (for *neko*, cat: stroking a cat). Atrium records the path of key hand joints and, at recall, compares your new gesture with **your own recording** using dynamic time warping. It never assigns gestures from a fixed list, because gestures that don't match the meaning can hurt recall.

### 3. The dimming palace
Each lantern's brightness **is** the memory's live recall probability from the FSRS model.

| Recall probability | Lantern |
| --- | --- |
| ≥ 90% | Full, steady glow |
| 82–90% | Dimming |
| 75–82% | Flickering |
| < 75% | Flickering, scene loses colour |

The bands sit just under the 90% retention target because the FSRS-6 forgetting curve is long-tailed: a memory left alone for three weeks is still at ~74%. Wider bands would almost never show. They are one constant in `src/core/lantern.ts`, to be tuned with real review data.

Relighting a flickering lantern with a correct recall plays a warm chime and a burst of light. That moment is the core reward.

### 4. No-backlog sessions
Each session has a fixed time budget (7 minutes by default). Atrium ranks due memories by how close they are to being forgotten, weighted by your goal and deadline, and fills only that budget. Overflow is spread across the coming days. After three or more missed days, a **Comeback walk** shows only the 10 most important fading memories, with no due count shown.

### 5. Readiness score
Set a goal with a date (*"JLPT N5 on 1 March"*). Atrium gives two honest numbers from the same FSRS model: what share of the goal you'd recall on the day **if you stopped today**, and the **reviews per day** that keep every goal memory at the retention target until then (simulated forward with FSRS). Goal memories also get deadline urgency in session triage.

### 6. Habit system

| Mechanic | Rule |
| --- | --- |
| **Ember streak** | The day counts after one 60-second recall, in the headset or on your phone |
| **Freezes** | Each full headset session earns one freeze (bank up to 3) |
| **Repair** | Restore a broken streak within 48 hours by completing a double session |
| **Weekly mode** | Optional: 5 of 7 days counts as a streak week |
| **Milestones** | 7 / 30 / 100 / 365 days unlock new wings and palace themes |
| **Wings** | Every 20 memories open a new wing of 20 alcoves; step between wings from the home menu (the room re-fills inside the snap fade) |

**Guardrails:** no paid streak protection, no loot boxes, no notifications, and a gentle stop after 20 minutes. Leagues rank by memories kept, not reviews done; they are opt-in, with an anonymous mode and no demotion.

### 7. Phone companion
`/companion.html`, paired with the headset by a 6-letter code. Capture text into the inbox (optionally for a goal), keep the streak alive with a 60-second **mental walk** (a top-down map of one wing; type each answer and Atrium grades it against the stored answers, never self-rated), see goals with readiness, manage connected agents, and export or delete your data.

### 8. Room mode *(built; untested on a device)*
Pin memories to real objects you can see from your chair (a lamp, a shelf, the window) using spatial anchors, so your real room can cue recall after the headset comes off. The virtual palace stays the default.

### 9. Wind-down mode *(optional)*
A low-light, ungraded walk through the day's new memories before bed (**Settings → More → Wind-down walk**).

### 10. Real 3D objects, including your own
Every prop on a pedestal is a real 3D model, generated from its painting with **Aholo Lux3D** (image-to-3D) and shrunk for a standalone headset (about 10k triangles, meshopt geometry, 1024 px WebP textures: 8 MB → about 300 KB). The painting shows first and stays if a model can't load, so nothing ever depends on the network.

- **Twist-to-3D.** Say (or, on a computer, type) a personal detail like *"my grandmother's round glasses"*, and it becomes a one-off 3D object on the pedestal: Lux3D text-to-3D, then Lux3D mesh retopology with a baked 512 px texture (~0.5 MB), stored once on our server so it outlives the API. A painted prop or a gold star holds its place for the two or three minutes it takes.
- **Leeches get stranger objects.** After three misses, Atrium asks *you* for something strange that belongs with the memory and builds it beside the scene. Effort goes where memory actually fails, and the idea stays yours.
- **Keepsakes.** On a computer, any object you generated can be exported as an STL through Lux3D's multi-format export, for a 3D printer: a physical cue for your desk.

### 11. Speech everywhere, and an agent on one device
The Quest browser has no speech recogniser, so there the headset records your answer (stopping when you go quiet, uploading nothing if you said nothing) and the server transcribes it with Whisper on Groq (Gemini as a fallback). **Ask an agent** in the home menu has a study agent write five facts on a topic and file them in your inbox through the same path an outside MCP agent uses, so the agent loop can be tried without a second device.

---

## Architecture

*All of this is built; the cloud is optional, and the headset never waits for it.*

One web project holds the headset app, the API, the MCP server and the companion page, deployed to a single URL.

```mermaid
flowchart LR
    subgraph Inputs
        AG[AI agents<br/>any MCP client]
        PH[Phone companion<br/>capture + 1-min recall]
        VO[Voice in headset<br/>“remember this”]
    end

    subgraph Cloud["Cloud · one deploy"]
        MCP[MCP server + API<br/>keys · scopes · rate limits]
        PIPE[AI pipeline<br/>facts → 3 scene drafts]
        KM[(Knowledge model<br/>memories · reviews · gestures)]
    end

    subgraph Headset["Headset app · IWSDK"]
        REN[Palace renderer<br/>Lux3D prop kit · 72 fps]
        GM[Gesture matcher<br/>DTW on hand-joint paths]
        FS[FSRS scheduler<br/>drives lantern brightness]
    end

    AG --> MCP
    PH --> MCP
    VO --> MCP
    MCP --> PIPE --> KM
    KM <-->|sync| FS
    GM -->|grade| FS
    FS --> REN
```

- **Offline-first headset.** Due memories sync down and review results sync up. Grading and scheduling run on the device, so reviews keep working without a network.
- **The first five minutes need no network.** The preset deck ships with the build, so onboarding can never fail on a slow connection.
- **Background capture.** Imports are processed in the cloud while you use the palace, and arrive in your inbox.

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Headset app | [three.js](https://threejs.org) + raw WebXR (TypeScript, Vite) | Hand joints, select-on-pinch and head gaze straight from WebXR; ships as a link; the same code targets VR Glasses. IWSDK (built on three.js) is an option later; direct WebXR keeps the input layer fully under our control. |
| Scheduler | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | FSRS-6 in TypeScript, runs on the device |
| Gesture matching | Custom recogniser (DTW) | Grades your gesture against your own recording |
| Speech | Web Speech API (recognition in `ja-JP`, narration via speech synthesis) | Spoken answers and twists; pinchable fallback when missing |
| Audio | Web Audio, synthesised | No audio files to download |
| 3D assets | Aholo Lux3D models generated from our own paintings (`scripts/lux3d.mjs`: image-to-3D, then meshopt + WebP via glTF-Transform), with the painted cut-outs and three.js primitives as fallbacks | Real depth in stereo, at about 300 KB a model. Each tier falls back to the next, so a slow network or a missing model just shows the painting. The scene JSON is the same for all three. |
| AI pipeline | Gemini (`gemini-3.8-flash`), Groq (`openai/gpt-oss-120b`) or NVIDIA (`meta/llama-3.3-70b-instruct`) through their OpenAI-compatible chat APIs, JSON-schema output, no SDK; Whisper on Groq for speech | One call drafts every item and its three scenes; output is validated with Zod and clamped to the prop kit. Without a key, an offline line-based drafter takes over. |
| Hosting | Cloudflare Pages: static app + one Pages Function for `/api/*` (Web-standard `fetch` handler) | One deploy, one URL, edge-served |
| Database | Postgres: Neon in production, PGlite (Postgres in WASM) locally and in tests | Same SQL everywhere; no ORM |
| MCP | MCP TypeScript SDK, stateless Streamable HTTP | Any MCP client connects with a per-agent key |

---

## Project structure

```
atrium/
├── index.html                  # the website (hero, how it works, the cast, companion); fades into the palace
├── public/art/                 # shipped art: models/ (Lux3D GLBs), props/ (painted cut-outs), site/ (page art)
├── scripts/art.sh              # regenerates public/art from the source renders in design/ (gitignored)
├── src/
│   ├── main.ts                 # renderer, XR session, loop, home screen, settings
│   ├── core/                   # pure logic, no DOM; all unit-tested
│   │   ├── gesture.ts          # resample, centre, DTW, enrol, match
│   │   ├── model.ts            # FSRS replay from the review log, recall probability
│   │   ├── grade.ts            # answer + gesture + latency → again/hard/good
│   │   ├── triage.ts           # no-backlog session planning, comeback walk
│   │   ├── streak.ts           # ember streak, freezes, 48 h repair
│   │   ├── lantern.ts          # recall probability → brightness, flicker, saturation
│   │   ├── answer.ts           # kanji / kana / romaji answer matching
│   │   └── twist.ts            # spoken twist → prop kit changes (offline)
│   ├── headset/
│   │   ├── palace.ts           # room, 20 alcoves, lanterns, snap-and-fade turning
│   │   ├── input.ts            # gaze + pinch, flick, dwell, hand-joint gesture features
│   │   ├── stage.ts            # captions, buttons, scene cards, pause: awaitable steps
│   │   ├── flows.ts            # first five minutes, recall, daily session, inbox, capture, pairing, wind-down
│   │   ├── cloud.ts            # API client; fails soft to offline
│   │   ├── layout.ts           # palace layout constants (shared with the companion map)
│   │   ├── scene-builder.ts    # scene JSON → 3D group, desaturation
│   │   ├── store.ts            # offline store + sync queue (review log is the source of truth)
│   │   ├── speech.ts           # recognition + narration, with fallbacks
│   │   ├── audio.ts            # synthesised chimes
│   │   └── ui.ts               # canvas-text panels and buttons
│   ├── companion/main.ts       # phone page: pair, capture, mental walk, goals, agents, data
│   └── shared/
│       ├── types.ts            # Memory, Review, SceneSpec, InboxItem, Goal
│       ├── props.ts            # prop kit: Lux3D model → painting → primitive, colour variants, tint, fading
│       ├── props-catalog.ts    # prop ids only (server-safe)
│       └── deck-ja.ts          # preset 6-word Japanese deck (ships offline)
├── companion.html              # phone companion page
├── server/
│   ├── routes.ts               # the whole REST API as one fetch handler
│   ├── mcp.ts                  # MCP server: 8 tools (incl. build_palace, get_journey), per-agent keys and scopes
│   ├── pipeline.ts             # Gemini/Groq/NVIDIA drafting (JSON schema) + offline drafter
│   ├── lux3d.ts                # twist-to-3D: Lux3D text-to-3D → retopology → stored GLB; STL export
│   ├── speech.ts               # speech-to-text for the Quest browser (Whisper on Groq, Gemini fallback)
│   ├── knowledge.ts            # due / known / gaps / readiness from the review log
│   ├── ops.ts                  # data operations shared by REST and MCP
│   ├── auth.ts                 # hashed tokens, scopes, rate limits
│   └── db.ts                   # schema; Neon in prod, PGlite locally and in tests
├── functions/api/[[path]].ts   # Cloudflare Pages Function: every /api/* request
├── vite.config.ts              # mounts the API in the dev server; builds both pages
├── wrangler.toml               # Cloudflare Pages config (nodejs_compat)
└── tests/
    ├── core.test.ts            # gesture, grading, FSRS, triage, streak, answers, deck schema
    └── server.test.ts          # pairing, capture, sync, isolation, MCP over HTTP, privacy
```

---

## Getting started (developers)

### Prerequisites

- **Node.js 20.19+**
- A **Meta Quest 3 / 3S** for device testing. Desktop mode is fine for day-to-day work, but performance, hand tracking and speech must be checked on hardware.

### Install and run

```bash
git clone https://github.com/<your-org>/atrium.git
cd atrium
npm install

cp .env.example .env.local    # optional: an AI key (Gemini/Groq/NVIDIA), AHOLO_API_KEY for 3D, DATABASE_URL for Neon
npm run dev                   # headset app + companion + API + MCP on one dev server
```

Open the printed URL and press **Try on desktop**; the companion is at `/companion.html`. With no `.env`, the API stores data in embedded Postgres under `.data/` and drafts with the offline line-based drafter. Useful URL flags:

| Flag | Effect |
| --- | --- |
| `?reset` | Erase local data and start the first five minutes again |
| `?skip=3d` / `?skip=12h` | Run the clock ahead to see lanterns fade, the daily session and the comeback walk (`?skip=0d` restores real time) |
| `?gaze=1` | Gaze-only mode (dwell 1 s to select) |

### Test on a Quest headset

The Quest browser needs **HTTPS** to enter VR. Either:

- deploy a preview (`npx wrangler pages deploy dist --project-name atrium --branch preview`) and open its URL in the headset, or
- run `npm run dev -- --host`, tunnel it over HTTPS, and open the tunnel URL in the Quest browser.

### Deploy (Cloudflare Pages + Neon)

```bash
npm run build
npx wrangler pages deploy dist --project-name atrium --branch main
```

Cloud features need a Postgres database (e.g. a free Neon project). Put the keys in `.env.local`, copy them into Cloudflare in one go, then redeploy:

```bash
scripts/secrets.sh      # DATABASE_URL, AHOLO_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, … whichever are set
```

To rebuild the 3D prop library after adding or changing a painting: `node scripts/lux3d.mjs` (only props without a model are generated; pass names to redo specific ones).

Tables are created on the first request. Without `DATABASE_URL` the API answers `/api/health` with `db: "none"` and the headset stays happily offline. The headset app is `/`, the companion `/companion.html`, the MCP endpoint `/api/mcp`.

### Useful scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Local dev server with hot reload |
| `npm run build` | Type-check + production build |
| `npm run preview` | Serve the production build |
| `npm run test` | Unit + integration tests (core logic, save migration; API, sync, MCP and twist-to-3D against an in-memory Postgres) |
| `npm run lint` | Type-check |
| `scripts/art.sh` | Rebuild the 2D art from `design/art`: prop cut-outs, site art, cursors (ImageMagick + rembg) |
| `node scripts/lux3d.mjs [names…]` | Generate missing 3D props with Aholo Lux3D and optimise them (needs `AHOLO_API_KEY`) |
| `scripts/secrets.sh` | Copy the keys in `.env.local` into the Cloudflare Pages project as secrets |

---

## Environment variables

All optional locally (see `.env.example`).

| Variable | Needed in production | Description |
| --- | :---: | --- |
| `DATABASE_URL` | ✅ | Postgres connection string (e.g. Neon). Unset → embedded PGlite in `.data/` |
| `GEMINI_API_KEY`, `GROQ_API_KEY` or `NVIDIA_API_KEY` | ⬜ | AI scene drafting, free-form twists, the study agent (preference in that order). Groq or Gemini also transcribe speech for the Quest browser. Unset → offline drafter, multiple-choice recall on Quest |
| `AHOLO_API_KEY` | ⬜ | Aholo Lux3D (global region): twist-to-3D, leech objects, 3D-print export. Unset → painted props only |
| `LLM_MODEL` | ⬜ | Override the model (default `gemini-3.8-flash` / `openai/gpt-oss-120b` / `meta/llama-3.3-70b-instruct`) |
| `PUBLIC_BASE_URL` | ⬜ | Origin used in pairing links and MCP URLs when behind a proxy |
| `PGLITE_DIR` | ⬜ | Where the local embedded database lives (default `.data/pglite`) |

No signing secret is needed: device and agent tokens are random 192-bit values stored only as SHA-256 hashes.

---

## MCP server for AI agents

Atrium exposes a remote **Model Context Protocol** server, so any MCP-compatible agent can **write** things you need to remember and **read** what you already know.

### Connect a client

```json
{
  "mcpServers": {
    "atrium": {
      "url": "https://atrium-b0r.pages.dev/api/mcp",
      "headers": { "Authorization": "Bearer <your-atrium-api-key>" }
    }
  }
}
```

Create a key in the companion under **Agents** (read + write, write-only, or read-only); it shows the config above, filled in, once. Keys are revocable at any time, and writes are rate-limited (30 per hour per key).

### Tools

| Tool | Scope | Description |
| --- | --- | --- |
| `add_memories` | write | Send text or facts, with an optional topic and goal. Items wait in your inbox until you co-create them. |
| `create_goal` | write | Create a goal with a deadline. |
| `list_due` | read | What's fading today and how long the session will take. |
| `get_known` | read | Facts in a topic you reliably recall (> 90% predicted). |
| `get_gaps` | read | Facts in a goal you're most likely to forget, ranked. |
| `get_readiness` | read | Recall on the deadline if the user stops today, and the reviews/day that keep them on track. |

### Example

```text
You → agent:  "Add the 12 cranial nerves to my Atrium for my anatomy exam."
Agent → add_memories({ topic: "Cranial nerves", goal: "Anatomy block", facts: ["CN I – olfactory", …] })
Atrium → 12 items appear in your headset inbox, ready to co-create.
```

> **Safety by design:** imported items never enter the palace until you co-create them, so an agent can't fill your memory with things you didn't choose.

---

## Data model

FSRS state is never stored: it is replayed from the append-only review log on every device, so sync is a merge of new reviews (idempotent by client-generated id) plus upserted memories. Full schema in `server/db.ts`; simplified:

```sql
users       (id, streak jsonb)
tokens      (id, user_id, kind device|agent, name, scopes text[], hash, revoked, last_used_at)
pairings    (code, user_id, expires_at)                  -- one-time, 10 minutes
goals       (id, user_id, name, deadline date, target)
inbox       (id, user_id, source voice|phone|agent, status new|placed|discarded, goal_id, item jsonb)
memories    (user_id, id, topic, goal_id, data jsonb)    -- question, answers, scene, twist, gesture paths, slot
reviews     (user_id, id, memory_id, at, data jsonb, seq) -- grade, answer_ok, gesture_score, latency, source
rate_limits (token_id, window_start, count)
```

---

## Algorithms

### Gesture matching

1. **Capture:** every frame for 2 s (3 s at recall). Per hand: the **wrist's path** in the head's yaw frame (÷ 15 cm), plus five **finger curls** (fingertip-to-wrist ÷ hand size, down-weighted). Keeping the wrist path matters because iconic gestures (stroking a cat) are mostly wrist movement. On desktop, the mouse path.
2. **Normalise:** resample to 32 frames; centre the position dimensions on the gesture's own mean, so where you start doesn't matter, only the shape.
3. **Enrol:** record twice. The DTW distance between the takes sets your tolerance, with a floor so two near-identical takes don't make the gesture impossible to repeat. If you barely moved, or the takes differ a lot, Atrium asks again.
4. **Match:** banded **dynamic time warping** to the nearer take; accept within tolerance × 2.2 (lenient on purpose).
5. **Grade:** the spoken answer decides pass or fail. Correct + gesture matched → *good*. Correct but gesture missed or slow (> 8 s) → *hard*. Wrong or "Show me" → *again*. A correct answer never grades below *hard*, because *again* resets FSRS stability.

### Session triage

```text
due              = recall_probability < 0.9  or  FSRS due time passed (short learning steps)
priority(memory) = (1 − recall_probability) × goal_weight × deadline_urgency
session          = top items by priority until the time budget (7 min ≈ 21 recalls) is filled
overflow         = simply waits; it is ranked again tomorrow, and no pile is ever shown
comeback walk    = after ≥ 3 days with no reviews: top 10 by priority, no due count shown
repair           = a missed item is asked again two items later, once
```

### Lantern brightness

Brightness follows the live recall probability on the FSRS-6 forgetting curve, computed in fractional days so lanterns fade smoothly rather than in daily steps. It is squared so early fading is visible. Lanterns flicker below 0.82 and the scene desaturates below 0.75. The scale uses **brightness, not hue**, so it's safe for colour-blind users.

---

## Visual identity: The Living Garden

One design system across the headset, the landing page and the companion. Tokens live in `src/shared/theme.ts` (3D) and `src/shared/theme.css` (pages).

| Token | Hex | Used for |
| --- | --- | --- |
| Warm Ivory | `#F4F0E6` | Companion surfaces, in-world text |
| Forest Green | `#173D32` | Palace walls, companion type and primary controls |
| Muted Gold | `#B99A62` | Lanterns, titles, focus and hover, hairlines |
| Deep Charcoal | `#26332D` | Niches, shadows, panels |
| Soft Sage | `#DCE7D9` | Sky light, quiet surfaces |
| Terracotta | `#C98265` | Misses and destructive actions only |

- **Type:** Fraunces (titles, editorial) and Source Sans 3 (body, VR-legible), bundled locally so the first five minutes stay offline.
- **The lantern is the signature:** muted gold, it washes its own niche wall, so a fading memory visibly darkens its alcove. A successful recall makes it bloom and releases rising gold motes.
- **3D props from paintings:** every prop is a real 3D model, generated from our own painting with Aholo Lux3D, lit by its own soft image-based light (so it shades without relighting the palace) and turning gently so it reads as solid. The painting shows first and stays if a model can't load. A colour close to a painted variant (orange, black or white cat; water or honey drop) uses that model; any other colour tints it, and a fading memory greys it in the shader.
- **Living lanterns:** each lantern hangs from its hoop as a pendulum. On a computer a nearby cursor tugs it close; let go and a damped spring swings it home in a few fading sways (about 2.5 s).
- **Interface:** gold-rimmed pill buttons sized to their label (text shrinks rather than wraps), gold plaques on each pedestal, an ornate caption card that always sits below the pedestals, and the three scene choices framed on one panel so the room behind never cuts in. Cursors are cut from the same art (`public/art/ui`).
- **Motion:** panels ease in when their content changes and buttons ease on hover (180 ms); the doorway fades into the palace; `prefers-reduced-motion` is respected on the pages.

---

## Design rules for VR Glasses

- **Controller-free from launch to exit.**
- **Seated, two-foot radius:** nothing needs reaching beyond a forearm's length or turning the torso.
- **Central 35°:** all text, active lanterns and buttons sit in the middle of the view, to fit the ~70° field of view of Meta VR Glasses.
- **No palm-up gestures near the face:** that pose opens the Quest system menu.
- **Hands-lost recovery:** if tracking drops for more than 2 s, pause and show *"Show your hands"*; resume when they're back.
- **Comfort:** snap movement with a 150 ms fade, no smooth camera motion, a fixed horizon, a floor under the chair.
- **Fast in, fast out:** cold start to first pinch in under 10 s; pause and resume keep your exact place.

---

## Accessibility

- **Gaze-only mode:** dwell to select; no gestures needed ✅
- **Captions** on all narration ✅
- **Larger text** ✅
- **Colour-blind-safe** lanterns (brightness, not hue) ✅
- **No-speech fallback:** pinchable answers ✅
- *(planned)* Voice-only mode, explicit one-handed mode, high-contrast theme

---

## Performance budget

| Metric | Target (Quest 3) |
| --- | --- |
| Frame rate | Steady 72 fps (≤ 13.9 ms per frame); Quest 3's lowest refresh rate is 72 Hz, requested via `updateTargetFrameRate` |
| Visible scenes | ≤ 12 alcoves at once |
| Lighting | 1 hemisphere light, no shadows; lanterns are emissive + additive sprites; 3D props add one small shared environment map (IBL) |
| 3D props | About 10k triangles each, meshopt geometry, 1024 px WebP textures; ~300 KB a model, 7.5 MB for all 26 |
| Cold start to first pinch | < 10 s |
| Scene creation after choosing | Instant (assembled from the prop kit); a twist-to-3D object arrives in ~2.5–3 min, a placeholder holds its spot |
| First five minutes | Fully offline |

---

## Privacy and security

What you know is personal data, and Atrium treats it that way.

- **Per-agent keys and scopes** (read + write, write-only, read-only), revocable from the phone; tokens are stored only as SHA-256 hashes and shown once.
- **Nothing enters your palace without you:** every import waits in the inbox until you co-create it in the headset.
- **Prompt-injection hygiene:** captured text is passed to the model as data, never as instructions, and model output is validated: unknown props dropped, every number clamped, exactly three scenes.
- **Rate limits** on writes (30/hour per agent key), input size limits, schema validation on every request body.
- **Every query is scoped to the caller's user**; tests check that one account can't see another's.
- **Gesture recordings** are stored only as normalised joint paths, never as video.
- **Export and delete:** download everything as JSON or delete your account (cascades to all data and tokens) from the phone, or erase from the headset.
- **Works offline:** the headset never needs the cloud to review.

---

## Research foundation

Every core feature rests on published work. These are the studies' own results, not Atrium's. Atrium's effect is unmeasured until tested with users.

| Finding | Source | Shapes |
| --- | --- | --- |
| A memory palace in a headset gave **8.8% better recall** than the same palace on a monitor | Krokos, Plaisant & Varshney, *Virtual Reality* (2019) | The palace |
| Gestures help word memory **only when they match the meaning**; mismatched or meaningless gestures did worse than none | *Applied Psycholinguistics*, gestures and L2 learning | Invented iconic gestures |
| Writing your own mnemonic story for Chinese characters scored **18.8 percentage points higher** on written recall immediately (descriptive pilot, n = 8), but took 1.69× as long to study | [arXiv 2611.01973](https://www.alphaxiv.org/abs/2611.01973) | Co-creation (keep it quick) |
| Unrestricted AI help raised task scores but **not knowledge gained** | [arXiv 2412.09315](https://www.alphaxiv.org/abs/2412.09315) | AI drafts, you decide |
| Flip-and-self-rate is an impoverished review; effortful recall works better | [Memdora, arXiv 2607.25096](https://www.alphaxiv.org/abs/2607.25096) | Graded recall |
| Personalised mnemonics as AI-generated 3D models in AR (slow to generate; timings in the paper) | [VocabulARy 2.0, arXiv 2611.07798](https://www.alphaxiv.org/abs/2611.07798) | A pre-generated 3D prop kit for instant scenes; live generation only for the learner's own twist, with a placeholder meanwhile |
| Adjusting a VR memory palace's spatial layout to a person's cognitive load raised EEG focus markers (n = 10) | [arXiv 2506.02700](https://www.alphaxiv.org/abs/2506.02700) | Calm, simple alcoves |
| Auto-generated keyword cues support vocabulary learning | [arXiv 2305.10436](https://www.alphaxiv.org/abs/2305.10436), [arXiv 2501.17099](https://www.alphaxiv.org/abs/2501.17099) | Scene drafts |

---

## Roadmap

- [x] Concept, research and design
- [x] **Headset core:** palace, first five minutes, co-creation, gesture signature, dimming lanterns, graded recall, no-backlog sessions, comeback walk, streaks with freezes and repair, gaze-only mode, captions
- [x] **Cloud:** API, offline-first sync, AI scene drafting (Gemini, Groq or NVIDIA, with an offline fallback), voice capture, inbox co-creation, pairing
- [x] **Real 3D:** 26-prop Lux3D library, twist-to-3D, leech objects, 3D-print keepsakes (STL)
- [x] **Quest speech:** recorded answers transcribed on the server (Whisper on Groq, Gemini fallback)
- [x] **Ask an agent:** a built-in study agent files five facts through the MCP path, on one device
- [x] **MCP server:** `add_memories`, `create_goal`, `list_due`, `get_known`, `get_gaps`, `get_readiness`
- [x] Readiness score and goals
- [x] Phone companion with graded mental walk
- [x] Wind-down mode
- [ ] Device pass on Quest 3: frame timing with 3D props, hand-tracking thresholds, microphone prompt
- [x] Deploy to Cloudflare Pages (https://atrium-b0r.pages.dev)
- [ ] Attach the database (Neon) and record the demo video
- [x] Wings (20 alcoves each, unlimited)
- [ ] Room mode (spatial anchors)
- [ ] Creator palaces and revenue share
- [ ] Launch alongside **Meta VR Glasses (spring 2027)**

---

## Competition submission

| | |
| --- | --- |
| **Competition** | Meta VR Start Developer Competition 2026 |
| **Track** | Productivity |
| **Division** | New Experience (built within the competition window) |
| **Platform** | Meta Quest 3 / 3S (Quest browser); designed for Meta VR Glasses |
| **Input** | Hands-first; fully usable without controllers |
| **Play mode** | Seated |
| **Target launch** | Spring 2027 |

---

## Contributing

Issues and pull requests are welcome after the judging period ends.

1. Fork the repo and create a branch: `git checkout -b feature/your-idea`
2. Run `npm run lint && npm run test` before you push
3. Open a pull request describing what changed and how you tested it on a headset

---

## License and credits

- **Code:** MIT (see `LICENSE`).
- **Art:** the painted props, palace, site art and cursors are the team's own renders, cut out with [rembg](https://github.com/danielgatis/rembg) by `scripts/art.sh`. The primitive fallbacks are made in code.
- **3D models:** generated from those paintings with [Aholo Lux3D](https://labs.aholo3d.com) (Manycore) by `scripts/lux3d.mjs`, then optimised with [glTF-Transform](https://gltf-transform.dev).
- **Speech:** Whisper (`whisper-large-v3-turbo`) on [Groq](https://groq.com).
- **Scheduling:** the open-source FSRS algorithm via `ts-fsrs`.

### Team

| Name | Role | Contact |
| --- | --- | --- |
| `<name>` | `<role>` | `<email>` |

<div align="center">

**AI made information infinite. Atrium makes it yours.**

</div>
