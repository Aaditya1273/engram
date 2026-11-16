<div align="center">

# Atrium

### Your hands write it. Your palace keeps it. You never fall behind.

**A seated, hands-only memory palace for Meta VR Glasses and Meta Quest.**
You co-create every memory with an AI agent, write it with your own gesture, and watch it fade and come back as you review.

`Productivity track` · `New Experience division` · `Meta VR Start Developer Competition 2026`

[Live build](#try-it-for-judges) · [Demo video](#demo) · [Architecture](#architecture) · [MCP server](#mcp-server-for-ai-agents) · [Research](#research-foundation)

</div>

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

Atrium runs in the Meta Quest browser. No install, no controllers and no account needed.

1. Put on a **Meta Quest 3 or 3S** and sit down.
2. Open the browser and go to **`<your-deployment-url>`**.
3. Press **Enter VR**, put the controllers down and raise your hands.
4. Follow the narrator. In about five minutes you'll learn six Japanese words and recall them.
5. **To try the agent:** on a phone or laptop, open **`<your-deployment-url>/companion`** and sign in with the demo key printed on the welcome screen. Type a topic (for example *"the 12 cranial nerves"*) and watch the items arrive in the headset inbox.

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
2. **Draft.** Atrium's agent extracts the facts and proposes **three vivid scenes** built from a pre-made 3D prop kit, each with a one-line mnemonic.
3. **Co-create.** Pinch the scene you like and add one personal detail by voice (*"make the cat wear my grandmother's glasses"*).
4. **Encode.** A ghost hand suggests a gesture that matches the meaning. You perform your own version twice, and Atrium records it as that memory's **gesture signature**.
5. **Place.** The scene settles into the next free alcove and its lantern lights at full brightness.

From then on the lantern dims along the memory's forgetting curve. A daily **7-minute session** relights the memories that are fading fastest and matter most for your goal.

---

## Controls

| Action | Hands | Gaze-only mode | Voice |
| --- | --- | --- | --- |
| Select | Look + pinch | Look + dwell 1 s | "Select" |
| Next arc of alcoves | Pinch + flick | Dwell on edge arrow | "Next" |
| Bring a scene closer | Pinch + pull toward you | Dwell on scene | "Closer" |
| Answer a recall | Say the answer + perform your gesture | Say the answer | Say the answer |
| Reveal | Pinch | Dwell | "Show me" |
| Pause | Open palm toward the room, 1 s | Dwell on pause icon | "Pause" |

No action ever needs a controller, standing up, or turning your body.

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
| 70–90% | Dimming |
| 50–70% | Flickering |
| < 50% | Flickering, scene loses colour |

Relighting a flickering lantern with a correct recall plays a warm chime and a burst of light. That moment is the core reward.

### 4. No-backlog sessions
Each session has a fixed time budget (7 minutes by default). Atrium ranks due memories by how close they are to being forgotten, weighted by your goal and deadline, and fills only that budget. Overflow is spread across the coming days. After three or more missed days, a **Comeback walk** shows only the 10 most important fading memories, with no due count shown.

### 5. Readiness score
Set a goal with a date (*"JLPT N5 on 1 March"*). Atrium forecasts what share of that goal you'll recall on the day, and sets the daily load needed to hit your target.

### 6. Habit system

| Mechanic | Rule |
| --- | --- |
| **Ember streak** | The day counts after one 60-second recall, in the headset or on your phone |
| **Freezes** | Each full headset session earns one freeze (bank up to 3) |
| **Repair** | Restore a broken streak within 48 hours by completing a double session |
| **Weekly mode** | Optional: 5 of 7 days counts as a streak week |
| **Milestones** | 7 / 30 / 100 / 365 days unlock new wings and palace themes |
| **Wings** | New arcs of alcoves at 25 / 100 / 500 mastered memories |

**Guardrails:** no paid streak protection, no loot boxes, at most one notification a day, and a gentle stop after 20 minutes.

### 7. Phone companion
Capture from anywhere, and keep the streak alive with a 60-second **mental walk**: recall one wing of your palace from a top-down map, then check your answers.

### 8. Room mode *(optional)*
Pin memories to real objects you can see from your chair (a lamp, a shelf, the window) using spatial anchors, so your real room can cue recall after the headset comes off. The virtual palace stays the default.

### 9. Wind-down mode *(optional)*
A low-light walk through the day's new memories before bed.

---

## Architecture

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
        REN[Palace renderer<br/>low-poly prop kit · 60 fps]
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
| Headset app | [Immersive Web SDK](https://developers.meta.com/horizon/) (TypeScript, Three.js) | Hand tracking and gaze-and-pinch built in; ships as a link; the same code targets VR Glasses |
| Fallback engine | Unity + Meta XR SDK v207 | Only if browser speech or passthrough camera access falls short |
| Scheduler | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | FSRS in TypeScript, runs on the device |
| Gesture matching | Custom recogniser (DTW) | Grades your gesture against your own recording |
| Speech | Web Speech API → cloud speech-to-text fallback | Spoken answers and twists |
| AI pipeline | Any LLM with structured JSON output | Providers can be swapped |
| 3D assets | CC0 low-poly prop kit (glTF) | Instant, licence-safe, holds 60 fps |
| Hosting | Vercel (static app + API routes + MCP endpoint) | One deploy, one URL |
| Database | Postgres (e.g. Neon) | Memories, review logs, gesture signatures |
| MCP | MCP TypeScript SDK over remote HTTP | Any MCP client can connect |

---

## Project structure

```
atrium/
├── src/
│   ├── headset/                 # IWSDK app
│   │   ├── palace/              # alcoves, lanterns, wings, snap movement
│   │   ├── input/               # pinch, gaze, gesture recorder + matcher
│   │   ├── session/             # first-five-minutes, daily session, comeback walk
│   │   ├── scheduler/           # ts-fsrs wrapper, triage, readiness
│   │   ├── capture/             # voice capture, inbox, co-creation flow
│   │   ├── audio/               # narration, captions, spatial audio
│   │   └── sync/                # offline queue, sync with the API
│   ├── companion/               # phone page: capture, QR pairing, mental walk
│   └── shared/                  # types, scene JSON schema, prop catalogue
├── api/
│   ├── mcp.ts                   # remote MCP endpoint
│   ├── memories.ts              # create, list, inbox
│   ├── sync.ts                  # due memories down, reviews up
│   ├── goals.ts                 # goals + readiness
│   └── pipeline/
│       ├── extract.ts           # text → facts
│       └── draft-scenes.ts      # fact → 3 scene options (JSON)
├── db/
│   ├── schema.sql
│   └── seed/                    # preset decks (work offline)
├── public/
│   └── assets/props/            # CC0 low-poly prop kit (glTF)
├── tests/
│   ├── gesture-matcher.test.ts
│   ├── triage.test.ts
│   └── scene-schema.test.ts
├── docs/
│   └── media/                   # GIFs and screenshots for this README
├── .env.example
└── README.md
```

---

## Getting started (developers)

### Prerequisites

- **Node.js 20.19+**
- **Postgres 15+**, local or hosted
- An **LLM API key** with structured JSON output
- A **Meta Quest 3 / 3S** for device testing. The IWSDK emulator is fine for day-to-day development, but performance and hand tracking must be checked on hardware.

### Install and run

```bash
git clone https://github.com/<your-org>/atrium.git
cd atrium
npm install

cp .env.example .env          # fill in the values below
npm run db:migrate            # create tables
npm run db:seed               # load preset decks

npm run dev                   # starts the headset app, companion page and API
```

Open the printed local URL in a desktop browser to use the IWSDK emulator.

### Test on a Quest headset

The Quest browser needs **HTTPS** to enter VR. Either:

- deploy a preview build (`npm run deploy:preview`) and open its URL in the headset, or
- tunnel your local server over HTTPS and open the tunnel URL in the Quest browser.

### Useful scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Local dev server with hot reload |
| `npm run build` | Production build |
| `npm run test` | Unit tests (gesture matcher, triage, scene schema) |
| `npm run lint` | Lint and type-check |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:seed` | Load preset decks |
| `npm run deploy:preview` | Deploy a preview build |
| `npm run deploy` | Deploy to production |

---

## Environment variables

| Variable | Required | Description |
| --- | :---: | --- |
| `DATABASE_URL` | ✅ | Postgres connection string |
| `LLM_API_KEY` | ✅ | Key for the scene-drafting model |
| `LLM_MODEL` | ✅ | Model identifier used by the pipeline |
| `SESSION_SECRET` | ✅ | Secret for signing sessions and API keys |
| `ATRIUM_DEMO_API_KEY` | ✅ | Key for the pre-connected judge demo account |
| `STT_API_KEY` | ⬜ | Cloud speech-to-text fallback, if Web Speech isn't available |
| `PUBLIC_BASE_URL` | ⬜ | Base URL for QR pairing links |

---

## MCP server for AI agents

Atrium exposes a remote **Model Context Protocol** server, so any MCP-compatible agent can **write** things you need to remember and **read** what you already know.

### Connect a client

```json
{
  "mcpServers": {
    "atrium": {
      "url": "https://<your-deployment-url>/api/mcp",
      "headers": { "Authorization": "Bearer <your-atrium-api-key>" }
    }
  }
}
```

Generate a key in the companion page under **Settings → Connected agents**. Each key has its own scopes and can be revoked at any time.

### Tools

| Tool | Scope | Description |
| --- | --- | --- |
| `add_memories` | write | Send text or facts, with an optional topic and goal. Items wait in your inbox until you co-create them. |
| `create_goal` | write | Create a goal with a deadline; it gets its own wing. |
| `list_due` | read | What's fading today and how long the session will take. |
| `get_known` | read | Facts in a topic you reliably recall (> 90% predicted). |
| `get_gaps` | read | Facts in a goal you're most likely to forget, ranked. |
| `get_readiness` | read | Forecast recall for a goal on its deadline. |

### Example

```text
You → agent:  "Add the 12 cranial nerves to my Atrium for my anatomy exam."
Agent → add_memories({ topic: "Cranial nerves", goal: "Anatomy block", items: [...] })
Atrium → 12 items appear in your headset inbox, ready to co-create.
```

> **Safety by design:** imported items never enter the palace until you co-create them, so an agent can't fill your memory with things you didn't choose.

---

## Data model

```sql
-- simplified
memories (
  id            uuid primary key,
  user_id       uuid,
  fact          text,          -- what to remember
  answer        text,          -- what recall is checked against
  mnemonic      text,          -- one-line hook
  scene         jsonb,         -- chosen props, positions, colours
  twist         text,          -- the user's personal detail
  gesture       jsonb,         -- recorded joint paths (2 enrolments)
  topic         text,
  goal_id       uuid,
  fsrs_state    jsonb,         -- stability, difficulty, due date
  created_at    timestamptz
)

reviews (
  id            uuid primary key,
  memory_id     uuid,
  reviewed_at   timestamptz,
  result        text,          -- again | hard | good | easy (derived)
  answer_ok     boolean,       -- spoken answer matched
  gesture_score real,          -- DTW similarity, 0–1
  latency_ms    integer
)

goals (id uuid, user_id uuid, name text, deadline date, target real)
agents (id uuid, user_id uuid, name text, scopes text[], key_hash text, revoked boolean)
```

---

## Algorithms

### Gesture matching

1. **Capture:** 6 key joints per hand (wrist and five fingertips) at ~30 Hz for ~2 s.
2. **Normalise:** express every point relative to the wrist and divide by hand size, so position and hand size don't matter.
3. **Enrol:** record the gesture twice. The distance between the two takes sets your personal tolerance.
4. **Match:** at recall, compute the **dynamic time warping** distance to the nearer enrolment. Accept if it falls within your tolerance × a lenient factor.
5. **Grade:** spoken answer correct + gesture matched → *good*. Answer correct, gesture missed → *hard*. Answer wrong → *again*. A slow correct answer drops one grade.

### Session triage

```text
priority(memory) = (1 − recall_probability) × goal_weight × deadline_urgency
session          = top items by priority until the time budget (default 7 min) is filled
overflow         = rescheduled with load balancing across the next days
comeback walk    = after ≥ 3 missed days: top 10 by priority, no due count shown
```

### Lantern brightness

`brightness = recall_probability` from FSRS, recomputed whenever the palace opens. It flickers below 0.7 and desaturates below 0.5. The scale uses **brightness, not hue**, so it's safe for colour-blind users.

---

## Design rules for VR Glasses

- **Controller-free from launch to exit.**
- **Seated, two-foot radius:** nothing needs reaching beyond a forearm's length or turning the torso.
- **Central 35°:** all text, active lanterns and buttons sit in the middle of the view, to fit the ~70° field of view of Meta VR Glasses.
- **No palm-up gestures near the face:** that pose opens the Quest system menu.
- **Hands-lost recovery:** if tracking drops for more than 2 s, pause and show *"Show your hands"*.
- **Comfort:** snap movement with a 150 ms fade, no smooth camera motion, a fixed horizon, a floor under the chair.
- **Fast in, fast out:** cold start to first pinch in under 10 s; pause and resume keep your exact place.

---

## Accessibility

- **Gaze-only mode:** dwell to select; no gestures needed
- **Voice-only mode:** every action has a spoken command
- **One-handed mode**
- **Captions** on all narration
- **Adjustable text size** and a **high-contrast theme**
- **Colour-blind-safe** lanterns (brightness, not hue)

---

## Performance budget

| Metric | Target (Quest 3) |
| --- | --- |
| Frame rate | Steady 60 fps (≤ 16.6 ms per frame) |
| Visible scenes | ≤ 12 alcoves at once |
| Lighting | 1 real-time light, baked shadows |
| Cold start to first pinch | < 10 s |
| Scene creation after choosing | Instant (assembled from the prop kit, no mesh generation) |
| First five minutes | Fully offline |

---

## Privacy and security

What you know is personal data, and Atrium treats it that way.

- **Per-agent keys and scopes** (write-only, one goal, or everything), revocable from the headset or phone.
- **Nothing enters your palace without you:** every import waits in the inbox until you co-create it.
- **Rate limits** on all write tools.
- **Gesture recordings** are stored only as normalised joint paths, never as video.
- **Export and delete:** download all your data or delete your account at any time.

---

## Research foundation

Every core feature rests on published work. These are the studies' own results, not Atrium's. Atrium's effect is unmeasured until tested with users.

| Finding | Source | Shapes |
| --- | --- | --- |
| A memory palace in a headset gave **8.8% better recall** than the same palace on a monitor | Krokos, Plaisant & Varshney, *Virtual Reality* (2019) | The palace |
| Gestures help word memory **only when they match the meaning**; mismatched or meaningless gestures did worse than none | *Applied Psycholinguistics*, gestures and L2 learning | Invented iconic gestures |
| Writing your own mnemonic scored **18.8 points higher** immediately (pilot, n = 8) | [arXiv 2611.01973](https://www.alphaxiv.org/abs/2611.01973) | Co-creation |
| Unrestricted AI help raised task scores but **not knowledge gained** | [arXiv 2412.09315](https://www.alphaxiv.org/abs/2412.09315) | AI drafts, you decide |
| Flip-and-self-rate is an impoverished review; effortful recall works better | [Memdora, arXiv 2607.25096](https://www.alphaxiv.org/abs/2607.25096) | Graded recall |
| Generated 3D mnemonics took ~1 min 55 s each and flickered on Quest 3 | [VocabulARy 2.0, arXiv 2611.07798](https://www.alphaxiv.org/abs/2611.07798) | Prop-kit scenes |
| Simple rooms with distinct landmarks support palace recall | [CogLocus, arXiv 2506.02700](https://www.alphaxiv.org/abs/2506.02700) | Alcove design |
| Auto-generated keyword cues support vocabulary learning | [arXiv 2305.10436](https://www.alphaxiv.org/abs/2305.10436), [arXiv 2501.17099](https://www.alphaxiv.org/abs/2501.17099) | Scene drafts |

---

## Roadmap

- [x] Concept, research and design
- [ ] **Hackathon build:** palace, co-creation, gesture signature, dimming lanterns, no-backlog sessions, streaks, voice/QR capture, `add_memories`
- [ ] Readiness score and goals
- [ ] `get_known` / `get_gaps` read tools
- [ ] Phone companion with mental walk
- [ ] Room mode (spatial anchors)
- [ ] Wind-down mode
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

Issues and pull requests are welcome after the judging period ends. Until then the `main` branch is frozen to match the submitted build.

1. Fork the repo and create a branch: `git checkout -b feature/your-idea`
2. Run `npm run lint && npm run test` before you push
3. Open a pull request describing what changed and how you tested it on a headset

---

## License and credits

- **Code:** MIT. See [`LICENSE`](LICENSE).
- **3D props:** CC0 low-poly asset packs. See [`public/assets/props/CREDITS.md`](public/assets/props/CREDITS.md).
- **Scheduling:** the open-source FSRS algorithm via `ts-fsrs`.

### Team

| Name | Role | Contact |
| --- | --- | --- |
| `<name>` | `<role>` | `<email>` |

<div align="center">

**AI made information infinite. Atrium makes it yours.**

</div>
