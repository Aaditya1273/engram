# Aholo Lux3D: how Atrium uses it, with measured numbers

Everything here was measured on Atrium's own account (global region, `https://api.aholo.ai/global`) between 17 and 18 November 2026, from Aholo's task list (`/lux3d/v1/generate/task/list`): times are Aholo's own `created` → `lastModified`, credits are its `consumedCredits`.

## What each tool does in Atrium

| Aholo tool | Where | What it's for in Atrium |
| --- | --- | --- |
| **Image-to-3D** (G1-Turbo, 10k faces) | `scripts/lux3d.mjs` | Every painted prop (26) becomes a real 3D model. The painting stays as the instant fallback. |
| **Text-to-3D** (G1-Turbo, cartoon) | `server/lux3d.ts`, `scripts/lumen.mjs`, `scripts/containers.mjs` | **Twist-to-3D**: your own words ("my grandmother's round glasses") become a one-off object. **Leech objects**: a stranger image for what you keep forgetting. **Lumen**, the coach. The "open to remember" chest. |
| **Mesh retopology** (4,000 tris, baked 512 px texture) | `server/lux3d.ts` | Slims every live-generated object to a headset budget (~450 KB) before it is stored. |
| **Material transfer** (v3.0-standard) | `scripts/finishes.mjs` | Silver and gold editions of every prop for the collection: a memory kept 30 days turns silver, 90 days gold. |
| **Auto-rig** | `scripts/lumen.mjs` | Gives Lumen a skeleton. |
| **Animation retarget** (5 clips, combined) | `scripts/lumen.mjs` | Lumen's idle-with-lantern, nod, dance, head-shake and talk. |
| **Articulation animation** | `scripts/containers.mjs` | A chest whose lid really opens: open it to check what you recalled. |
| **Multi-format export** (STL / 3MF) | `server/lux3d.ts` | Keepsakes: print your own generated object. |
| **Asset upload** (`/asset/v1/token` → OUS) | `scripts/aholo.mjs` | Lux3D reads inputs from URLs; paintings and models go up through Aholo's own store. |

## Measured times and credits

| Task type | Tasks | Succeeded | Credits each | Time (min / median / max) |
| --- | ---: | ---: | ---: | --- |
| image-to-3d | 35 | 34 | **1** | 54 / 68 / 106 s |
| text-to-3d | 4 | 4 | **13** | 77 / 99 / 122 s |
| mesh-retopology | 3 | 3 | **6** | 30 / 33 / 35 s |
| material-transfer | 39 | 35 | **~7.8** | 158 / 226 / 282 s |
| auto-rig | 1 | 1 | **15** | 126 s |
| animation-retarget (5 clips) | 1 | 1 | **6** | 8 s |
| articulation-animation | 1 | (running) | **28** | — |

**Total so far: 84 tasks, 426 credits.** End to end, a live twist-to-3D object (text-to-3D + retopology + storage) took about **2 min 40 s**, not the "about 20 seconds" sometimes quoted for Turbo; Atrium shows a painted or gold-star placeholder for that time and swaps the object in when it lands.

## Lessons (things that cost us time)

- **WebP input fails.** Image-to-3D returned status 4 (failed) with no message for a `.webp` URL; the same image as PNG worked. The scripts convert to PNG before upload.
- **Result URLs expire** (about two hours, as others have reported). Every result is downloaded and stored at once: props as files in the build, live objects in Postgres. Nothing in the app points at an Aholo URL.
- **Downloads can stall mid-body.** Node's fetch gave up after its 5-minute body timeout twice on 9 MB GLBs; the scripts now download with `curl --retry --retry-all-errors`. Uploads retry too.
- **Raw models are too heavy for a headset** (7.6–11 MB: ~9k triangles but 2048 px PNG textures). Locally, glTF-Transform (meshopt geometry, 1024 px WebP) takes them to **237–555 KB** with no visible loss. Retopology's baked texture showed small white patches on faces, so the prop library keeps the original mesh; live objects use retopology because they must be small before storage.
- **Meshopt quantises positions to 16-bit.** Baking a transform into such an attribute clamps it to [-1, 1] and crushes the model (our fountain rose on stilts until we dequantised first: `bakeTemplate` in `src/shared/props.ts`).
- **Concurrency**: we ran 4 tasks at a time (free accounts allow 5).
- **Auth**: the raw key in the `Authorization` header, no `Bearer`. Keys live only on the server and in local scripts; nothing reaches the client.

## Demo mode: no live Aholo calls needed

Everything a judge sees in the first minutes works with **no live Aholo calls**: the 26 props, their silver and gold editions, Lumen and the chest are static files in `public/art/models`, generated once by the scripts above. Live calls happen only when a learner names their own object (twist-to-3D, leech objects) or exports a keepsake, and all of them fall back to the painting if Aholo is slow, down, or out of credits. The deployment-wide daily cap (`CAP_LUX3D_DAY`, default 150) bounds spend.
