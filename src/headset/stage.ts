import * as THREE from 'three';
import { DECOR, PANEL } from '../shared/theme';
import type { DeckItem } from '../shared/types';
import { buildScene, type BuiltScene } from './scene-builder';
import { buttonWidth, makeButton, Panel, type Selectable } from './ui';
import { narrate } from './speech';
import { play } from './audio';
import type { Palace } from './palace';
import type { Input } from './input';

const CARD_BASE = new THREE.CylinderGeometry(0.1, 0.105, 0.012, 16);
const CARD_MAT = new THREE.MeshLambertMaterial({ color: DECOR.capTop, emissive: DECOR.goldEmissive, emissiveIntensity: 0.4 });
const CARD_HIT = new THREE.BoxGeometry(0.23, 0.34, 0.2);
const BUTTON_H = 0.072;
const HIT_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

/**
 * The director: narration, captions, buttons and waits, as awaitable steps so the flows read
 * top to bottom like a script. Layout keeps every active element inside the central ±17.5°
 * (eye at 1.2 m): buttons above the scene, captions below it.
 */
export class Stage {
  readonly hud = new THREE.Group();
  private caption = new Panel(0.66, 0.25, { size: 0.028, frame: 'ornate' });
  private topRow = new THREE.Group();
  private cards = new THREE.Group();
  private arrows = new THREE.Group();
  private pauseLayer = new THREE.Group();
  private pausePanel = new Panel(0.6, 0.3, { size: 0.03, bg: PANEL.bgStrong, border: PANEL.focus });
  private flickWaiter: ((d: 1 | -1) => void) | null = null;
  private alcoveWaiter: { slot: number; res: () => void } | null = null;
  private resumeWaiters: (() => void)[] = [];
  private builtCards: BuiltScene[] = [];
  private backdrop = new Panel(0.86, 0.47, { frame: 'ornate' });
  paused = false;
  browsing = false;
  onBrowseSelect: (slot: number) => void = () => {};

  constructor(private palace: Palace, private input: Input) {
    palace.root.add(this.hud);
    // Below the pedestal tops (about 10° down) so it never hides a scene. Tilted halfway toward the eye: a full
    // tilt keystones the text on a flat desktop view (the left half of a line leans like italics).
    this.caption.position.set(0, 0.79, -0.95);
    this.caption.lookAt(0, 1.0, 0);
    this.caption.visible = false;
    this.topRow.position.set(0, 1.53, -1.1);
    this.cards.position.set(0, 1.12, -0.82);
    // A framed backdrop behind the three choices, so the alcoves behind them don't show through and clutter the pick.
    this.backdrop.position.set(0, 0.06, -0.08);
    this.backdrop.visible = false;
    this.cards.add(this.backdrop);
    this.hud.add(this.caption, this.topRow, this.cards, this.arrows, this.pauseLayer);

    // Browse arrows ride on the caption card's left and right edges, so they never cover the palace.
    for (const dir of [-1, 1] as const) {
      const b = makeButton(dir < 0 ? '‹' : '›', () => this.flick(dir), 0.066, 0.066, { frame: 'round' });
      b.position.set(dir * 0.352, this.caption.position.y, this.caption.position.z + 0.002);
      b.lookAt(0, 1.0, 0); // the caption's tilt
      this.arrows.add(b);
    }
    this.arrows.visible = false;

    this.pausePanel.position.set(0, 1.2, -0.85);
    const sel: Selectable = { onSelect: () => this.resume(), onHover: (h) => this.pausePanel.setHovered(h) };
    this.pausePanel.userData.selectable = sel;
    this.pausePanel.userData.label = 'pause';
    this.pauseLayer.add(this.pausePanel);
    this.pauseLayer.visible = false;

    input.onFlick = (d) => this.flick(d);
    palace.onAlcoveSelect = (slot) => {
      if (this.paused) return;
      if (this.alcoveWaiter?.slot === slot) {
        const w = this.alcoveWaiter;
        this.alcoveWaiter = null;
        w.res();
      } else if (this.browsing) this.onBrowseSelect(slot);
    };
  }

  private flick(dir: 1 | -1) {
    if (this.paused) return;
    play('snap');
    if (this.flickWaiter) {
      const w = this.flickWaiter;
      this.flickWaiter = null;
      w(dir);
    } else if (this.browsing) void this.palace.snap(dir);
  }

  // ---------- pause & hands-lost ----------

  pause(title = 'Paused', body = 'Pinch to continue') {
    this.paused = true;
    this.pausePanel.set({ title, body });
    this.pauseLayer.visible = true;
    this.input.filter = (o) => o === this.pausePanel;
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.pauseLayer.visible = false;
    this.input.filter = () => true;
    this.resumeWaiters.splice(0).forEach((r) => r());
  }

  /** Every step awaits this first, so a pause holds the script exactly where it is. */
  whilePaused(): Promise<void> {
    return this.paused ? new Promise((r) => this.resumeWaiters.push(r)) : Promise.resolve();
  }

  // ---------- primitives ----------

  /** 'attention' (terracotta title) marks a miss; everything else uses the gold title. */
  show(title?: string, body?: string, tone: 'default' | 'attention' = 'default') {
    this.caption.visible = !!(title || body);
    this.caption.setAccent(tone === 'attention' ? PANEL.attention : PANEL.title);
    this.caption.set({ title, body });
  }

  /** Told when narration starts and stops (Lumen talks while it speaks). */
  onSpeaking: (on: boolean) => void = () => {};

  async say(text: string, title?: string, tone: 'default' | 'attention' = 'default') {
    await this.whilePaused();
    this.show(title, text, tone);
    this.onSpeaking(true);
    try {
      await narrate(text);
    } finally {
      this.onSpeaking(false);
    }
    await this.whilePaused();
  }

  sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  showArrows(on: boolean) {
    this.arrows.visible = on;
  }

  async ask<T>(options: { label: string; value: T }[]): Promise<T> {
    await this.whilePaused();
    return new Promise<T>((res) => {
      this.clearRow();
      this.layoutRow(options.map((o) => makeButton(o.label, () => {
        this.clearRow();
        play('tick');
        res(o.value);
      }, buttonWidth(o.label), BUTTON_H)));
    });
  }

  /**
   * Desktop only: a text field over the canvas for when typing beats talking. Resolves with the text,
   * or '' on Escape. Keys typed here don't reach the palace's shortcuts.
   */
  typeText(placeholder: string, opts: { multiline?: boolean } = {}): Promise<string> {
    return new Promise((res) => {
      // Multi-line for pasting a chapter or notes: Ctrl/Cmd+Enter builds, plain Enter is a new line.
      const el = document.createElement(opts.multiline ? 'textarea' : 'input') as HTMLInputElement;
      if (opts.multiline) Object.assign(el.style, { height: '38vh', borderRadius: '18px', resize: 'none', lineHeight: '1.45' });
      else el.type = 'text';
      el.maxLength = opts.multiline ? 40_000 : 120;
      el.placeholder = placeholder;
      el.setAttribute('aria-label', placeholder);
      Object.assign(el.style, {
        position: 'fixed', left: '50%', bottom: '18%', transform: 'translateX(-50%)', width: opts.multiline ? 'min(46rem, calc(100vw - 32px))' : 'min(32rem, calc(100vw - 32px))',
        padding: '14px 18px', borderRadius: '999px', border: '1px solid #d9b76e', background: 'rgba(14, 26, 21, 0.92)',
        color: '#f4f0e6', font: '500 1.05rem system-ui, sans-serif', outline: 'none', zIndex: '20', boxShadow: '0 0 24px rgba(217, 183, 110, 0.25)',
      });
      const done = (v: string) => {
        el.remove();
        res(v.trim());
      };
      el.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && (!opts.multiline || e.ctrlKey || e.metaKey)) done(el.value);
        if (e.key === 'Escape') done('');
      };
      document.body.appendChild(el);
      el.focus();
    });
  }

  /**
   * Centres buttons of differing widths, evenly gapped, at most five to a row (more would leave the central
   * view in a headset); extra rows stack downward.
   */
  private layoutRow(buttons: Panel[]) {
    const gap = 0.016, perRow = 5;
    for (let r = 0; r * perRow < buttons.length; r++) {
      const row = buttons.slice(r * perRow, r * perRow + perRow);
      const total = row.reduce((s, b) => s + b.w, 0) + gap * (row.length - 1);
      let x = -total / 2;
      for (const b of row) {
        b.position.set(x + b.w / 2, -r * (BUTTON_H + 0.014), 0);
        x += b.w + gap;
        this.topRow.add(b);
      }
    }
  }

  /** Buttons that stay up while something else happens (e.g. "Show me" during recall). */
  offer(options: { label: string; onSelect: () => void }[]) {
    this.clearRow();
    this.layoutRow(options.map((o) => makeButton(o.label, () => {
      this.clearRow();
      o.onSelect();
    }, buttonWidth(o.label), BUTTON_H)));
  }

  clearRow() {
    for (const c of [...this.topRow.children]) {
      this.topRow.remove(c);
      (c as Panel).dispose();
    }
  }

  waitAlcove(slot: number) {
    return new Promise<void>((res) => (this.alcoveWaiter = { slot, res }));
  }

  waitFlick() {
    return new Promise<1 | -1>((res) => (this.flickWaiter = res));
  }

  /** Three scene drafts as small dioramas in front of the user; resolves with the picked index. */
  async chooseScene(item: DeckItem): Promise<number> {
    await this.whilePaused();
    return new Promise((res) => {
      this.clearCards();
      this.backdrop.visible = true;
      const spacing = 0.25;
      item.scenes.forEach((spec, i) => {
        const card = new THREE.Group();
        card.position.set((i - 1) * spacing, 0, 0);
        card.lookAt(0, 0.08, 0.82);
        const base = new THREE.Mesh(CARD_BASE, CARD_MAT);
        const built = buildScene(spec);
        built.group.scale.setScalar(0.85);
        built.group.position.y = 0.006;
        this.builtCards.push(built);
        const text = new Panel(0.23, 0.1, { size: 0.0165, radius: 0.012, bg: 'rgba(16, 40, 31, 0.94)', border: 'rgba(217, 183, 110, 0.7)' }).set({ body: spec.mnemonic });
        text.position.set(0, -0.08, 0.03);
        const hit = new THREE.Mesh(CARD_HIT, HIT_MAT);
        hit.position.y = 0.05;
        const sel: Selectable = {
          onSelect: () => {
            if (this.paused) return;
            this.clearCards();
            play('tick');
            res(i);
          },
          onHover: (h) => {
            text.setHovered(h);
            card.scale.setScalar(h ? 1.08 : 1);
          },
        };
        hit.userData.selectable = sel;
        hit.userData.label = `card:${i}`;
        card.add(base, built.group, text, hit);
        this.cards.add(card);
      });
    });
  }

  private clearCards() {
    this.backdrop.visible = false;
    for (const c of [...this.cards.children]) {
      if (c === this.backdrop) continue;
      this.cards.remove(c);
      // Prop geometry is shared across the kit, so only panels and per-scene materials are freed.
      c.traverse((o) => o instanceof Panel && o.dispose());
    }
    this.builtCards.splice(0).forEach((b) => b.dispose());
  }

  /** "3, 2, 1, now": gives the user a beat to prepare before a gesture take. */
  async countdown(label: string) {
    for (const n of ['3', '2', '1']) {
      await this.whilePaused();
      this.show(label, n);
      play('tick');
      await this.sleep(420);
    }
    play('record');
    this.show(label, 'Now!');
  }
}
