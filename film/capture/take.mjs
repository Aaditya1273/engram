// Records the film's product shots: Atrium running on Meta's Immersive Web Emulation Runtime as a Meta Quest 3,
// driven by head gaze and hand pinches (rig.js). Every shot is a real session against the local app and API.
// Output: clips/<shot>.webm (the headset view) and clips/<shot>.json (pinch and event times, seconds).
//   node take.mjs [shot ...]   shots: build recall worlds language   (default: all, in order, one session)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW ?? '/home/bajrangi/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(HERE, 'clips');
const APP = 'http://localhost:5179';
fs.mkdirSync(OUT, { recursive: true });
const want = process.argv.slice(2);
const shots = want.length ? want : ['build', 'recall', 'worlds', 'language'];

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/home/bajrangi/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.addInitScript({ path: path.join(HERE, 'node_modules/iwer/build/iwer.min.js') });
await p.addInitScript(() => {
  const d = new IWER.XRDevice(IWER.metaQuest3);
  d.installRuntime({ forceInstall: true });
  d.primaryInputMode = 'hand';
  d.hands.left.connected = false; // one hand does the pinching; an idle second hand only clutters the frame
  window.__xr = d;
  // Answers are given by pinch (the menus), and Lumen's lines are paced by reading time, not a voice.
  delete window.webkitSpeechRecognition; delete window.SpeechRecognition;
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined });
  Object.defineProperty(window, 'speechSynthesis', { value: undefined });
});
await p.addInitScript({ path: path.join(HERE, 'rig.js') });

await p.goto(`${APP}/?reset&lang=en`);
await p.waitForTimeout(1500);
await p.evaluate(() => { const st = window.atrium.ctx.store; st.data.onboarded = true; st.data.settings.world = st.data.settings.theme = 'garden'; st.save(); });
await p.goto(`${APP}/?lang=en`);
await p.waitForTimeout(2500);
await p.click('[data-enter]');
await p.waitForTimeout(5000);

async function record(name, fn) {
  console.log('shot', name);
  await p.evaluate(() => rig.start());
  let err = null;
  try { await p.evaluate(fn); } catch (e) { err = e.message; console.log('  error', err); }
  const [dl, res] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.evaluate((n) => rig.stop(n), name)]);
  await dl.saveAs(path.join(OUT, `${name}.webm`));
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ marks: res.marks, err }, null, 1));
  console.log(`  ${name}: ${(res.size / 1e6).toFixed(1)} MB, ${res.marks.length} marks`);
}

const SHOTS = {
  // The empty forest palace, a look around, then one sentence becomes a palace, walked in stop by stop.
  build: async () => {
    await rig.lookDir(-8, 2, 10);
    await rig.sleep(700);
    await rig.lookDir(-58, 6, 3800);
    await rig.sleep(250);
    await rig.lookDir(48, 4, 6500);
    await rig.sleep(250);
    await rig.lookDir(0, 0, 2600);
    await rig.press('Build a palace', 900);
    await rig.waitFor('Cranial nerves', 30000);
    await rig.sleep(500);
    await rig.press('Cranial nerves', 800);
    rig.mark('building');
    await rig.waitFor('Walk it in', 150000);
    rig.mark('built', rig.caption());
    await rig.sleep(1200);
    await rig.press('Walk it in', 800);
    for (let i = 0; i < 14; i++) {
      const o = await rig.waitFor((l) => l === 'Next stop' || l === 'Done', 60000);
      const label = o.userData.label;
      rig.mark('stop', rig.caption());
      await rig.lookDir(0, -11, 800);
      await rig.sleep(1300);
      await rig.press(label, 650);
      if (label === 'Done') break;
    }
    await rig.waitFor('Walk it', 30000);
    rig.mark('walked');
  },
  // The lights go down: walk it from memory, forwards, each answer a pinch, faster as it goes.
  recall: async () => {
    const st = window.atrium.ctx.store;
    const names = st.data.memories.filter((m) => m.journey).sort((a, b) => a.journey.index - b.journey.index).map((m) => m.display);
    await rig.sleep(600);
    await rig.press('Walk it', 800);
    let quiet = 0, k = 0;
    while (quiet < 60) {
      const m = rig.caption().match(/number (\d+)/);
      const target = m && rig.find(names[+m[1] - 1]);
      if (!target) { quiet++; await rig.sleep(100); continue; }
      quiet = 0;
      rig.mark('prompt', rig.caption());
      const pace = Math.max(260, 900 - k * 70);
      await rig.sleep(pace);
      await rig.press(target, Math.max(300, 700 - k * 40));
      if (k % 4 === 0) { await rig.lookDir(0, -9, 500); await rig.sleep(700); }
      k++;
      // Wait for this prompt to clear before reading the next one.
      const before = rig.caption();
      for (let w = 0; w < 80 && rig.caption() === before; w++) await rig.sleep(80);
    }
    rig.mark('done', rig.caption());
  },
  // One palace, three worlds: a slow look around while the world changes.
  worlds: async () => {
    const pal = window.atrium.ctx.palace;
    await rig.lookDir(-40, 6, 10);
    await rig.sleep(400);
    await rig.lookDir(-10, 4, 2600);
    rig.mark('world', 'moonlit'); pal.setTheme('moonlit');
    await rig.lookDir(25, 8, 3400);
    rig.mark('world', 'sakura'); pal.setTheme('sakura');
    await rig.lookDir(-15, 5, 3400);
    rig.mark('world', 'garden'); pal.setTheme('garden');
    await rig.lookDir(30, -6, 3000);
    await rig.lookDir(0, 0, 1500);
  },
  // Settings, five languages: the palace answers in Japanese, then back.
  language: async () => {
    await rig.press('Settings', 800);
    await rig.press((l) => /^Language/.test(l), 700);
    await rig.press('日本語', 700);
    rig.mark('lang', 'ja');
    await rig.sleep(1600);
    await rig.press((l) => /^言語/.test(l), 900);
    await rig.press('हिन्दी', 700);
    rig.mark('lang', 'hi');
    await rig.sleep(1600);
    await rig.press((l) => /^भाषा/.test(l), 900);
    await rig.press('English', 700);
    rig.mark('lang', 'en');
    await rig.sleep(1200);
  },
};

for (const s of shots) await record(s, SHOTS[s]);

// The session was a fresh device: remove it from the database.
await p.evaluate(async () => {
  const tok = JSON.parse(localStorage.getItem('atrium:v1')).cloud.token;
  if (tok) await fetch('/api/account', { method: 'DELETE', headers: { authorization: 'Bearer ' + tok } });
});
await browser.close();
console.log('done');
