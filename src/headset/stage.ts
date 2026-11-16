import * as THREE from 'three';
import type { DeckItem } from '../shared/types';
import { buildScene, type BuiltScene } from './scene-builder';
import { makeButton, Panel, type Selectable } from './ui';
import { narrate } from './speech';
import { play } from './audio';
import type { Palace } from './palace';
import type { Input } from './input';

const CARD_BASE = new THREE.CylinderGeometry(0.1, 0.105, 0.012, 16);
const CARD_MAT = new THREE.MeshLambertMaterial({ color: '#a08566', flatShading: true });
const CARD_HIT = new THREE.BoxGeometry(0.23, 0.34, 0.2);
const HIT_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

/**
 * The director: narration, captions, buttons and waits, as awaitable steps so the flows read
 * top to bottom like a script. Layout keeps every active element inside the central ±17.5°
 * (eye at 1.2 m): buttons above the scene, captions below it.
 */
export class Stage {
  readonly hud = new THREE.Group();
  private caption = new Panel(0.66, 0.2, { size: 0.028 });
  private topRow = new THREE.Group();
  private cards = new THREE.Group();
  private arrows = new THREE.Group();
  private pauseLayer = new THREE.Group();
  private pausePanel = new Panel(0.6, 0.3, { size: 0.03, bg: 'rgba(12,9,6,0.95)' });
  private flickWaiter: ((d: 1 | -1) => void) | null = null;
  private alcoveWaiter: { slot: number; res: () => void } | null = null;
  private resumeWaiters: (() => void)[] = [];
  private builtCards: BuiltScene[] = [];
  paused = false;
  browsing = false;
  onBrowseSelect: (slot: number) => void = () => {};

  constructor(private palace: Palace, private input: Input) {
    palace.root.add(this.hud);
    this.caption.position.set(0, 0.88, -1.0);
    this.caption.visible = false;
    this.topRow.position.set(0, 1.53, -1.1);
    this.cards.position.set(0, 1.12, -0.82);
    this.hud.add(this.caption, this.topRow, this.cards, this.arrows, this.pauseLayer);

    for (const dir of [-1, 1] as const) {
      const b = makeButton(dir < 0 ? '‹' : '›', () => this.flick(dir), 0.07, 0.12);
      b.position.set(dir * 0.34, 1.2, -1.1);
      b.lookAt(0, 1.2, 0);
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

  show(title?: string, body?: string) {
    this.caption.visible = !!(title || body);
    this.caption.set({ title, body });
  }

  async say(text: string, title?: string) {
    await this.whilePaused();
    this.show(title, text);
    await narrate(text);
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
      const w = options.length > 3 ? 0.15 : 0.19, gap = 0.015;
      const total = options.length * w + (options.length - 1) * gap;
      options.forEach((o, i) => {
        const b = makeButton(o.label, () => {
          this.clearRow();
          play('tick');
          res(o.value);
        }, w, 0.075);
        b.position.x = -total / 2 + w / 2 + i * (w + gap);
        this.topRow.add(b);
      });
    });
  }

  /** Buttons that stay up while something else happens (e.g. "Show me" during recall). */
  offer(options: { label: string; onSelect: () => void }[]) {
    this.clearRow();
    const w = 0.19;
    options.forEach((o, i) => {
      const b = makeButton(o.label, () => {
        this.clearRow();
        o.onSelect();
      }, w, 0.075);
      b.position.x = (i - (options.length - 1) / 2) * (w + 0.015);
      this.topRow.add(b);
    });
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
        const text = new Panel(0.23, 0.1, { size: 0.016, bg: 'rgba(24,18,12,0.88)' }).set({ body: spec.mnemonic });
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
    for (const c of [...this.cards.children]) {
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
