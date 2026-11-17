import * as THREE from 'three';
import { encode } from 'uqr';
import { FONT, LANTERN, PALETTE, PANEL } from '../shared/theme';

/** Anything with userData.selectable is a gaze/pointer target. */
export interface Selectable {
  onSelect: () => void;
  onHover?: (hovered: boolean) => void;
}

const PX_PER_M = 1400;
export const UI_FONT = FONT.body;
let textScale = 1;
/** Accessibility: larger text everywhere; live panels redraw at once. */
export const setTextScale = (s: number) => {
  textScale = s;
  for (const p of live) p.draw();
};

/** Every live panel, so they can redraw once the bundled fonts finish loading. */
const live = new Set<Panel>();
if (typeof document !== 'undefined' && document.fonts) {
  const redraw = () => live.forEach((p) => p.draw());
  void Promise.all([
    document.fonts.load(`500 40px ${FONT.display}`),
    document.fonts.load(`400 40px ${FONT.body}`),
    document.fonts.load(`600 40px ${FONT.body}`),
  ]).then(redraw, redraw);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

export interface PanelStyle {
  bg?: string;
  fg?: string;
  /** Title colour. */
  accent?: string;
  /** Resting border; hover always draws the focus colour. */
  border?: string;
  size?: number;
  align?: CanvasTextAlign;
  radius?: number;
  /** Body weight: buttons read better a little heavier. */
  weight?: number;
}

const EASE_MS = 180;
const ease = (t: number) => 1 - (1 - t) ** 3;

/**
 * A flat text panel drawn to a canvas texture. Never billboards. Content changes fade in and
 * hover eases in (scale + border), so feedback is visible without anything snapping.
 */
export class Panel extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private style: Required<PanelStyle>;
  private content: { title?: string; body?: string } = {};
  private appear = 1;
  private hoverT = 0;
  private last = performance.now();
  hovered = false;

  constructor(readonly w: number, readonly h: number, style: PanelStyle = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * PX_PER_M);
    canvas.height = Math.round(h * PX_PER_M);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    super(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.tex = tex;
    this.style = {
      bg: PANEL.bg, fg: PANEL.fg, accent: PANEL.title, border: PANEL.hairline, size: 0.03, align: 'center', radius: 0.018, weight: 400,
      ...style,
    };
    this.renderOrder = 10;
    live.add(this);
    this.onBeforeRender = () => {
      // Clamped: a panel that was hidden skips frames, and its first frame back must still animate.
      const now = performance.now(), dt = Math.min(50, now - this.last);
      this.last = now;
      if (this.appear < 1) this.appear = Math.min(1, this.appear + dt / EASE_MS);
      const target = this.hovered ? 1 : 0;
      this.hoverT += Math.sign(target - this.hoverT) * Math.min(Math.abs(target - this.hoverT), dt / EASE_MS);
      this.material.opacity = ease(this.appear);
      this.scale.setScalar(1 + 0.035 * ease(this.hoverT));
    };
  }

  set(content: { title?: string; body?: string }) {
    if (content.title !== this.content.title || content.body !== this.content.body) this.appear = 0;
    this.content = content;
    this.draw();
    return this;
  }

  setAccent(color: string) {
    this.style.accent = color;
  }

  setHovered(h: boolean) {
    if (h === this.hovered) return;
    this.hovered = h;
    this.draw();
  }

  draw() {
    const { ctx, canvas, style } = this;
    const W = canvas.width, H = canvas.height, pad = 0.025 * PX_PER_M, inset = 4;
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.roundRect(inset, inset, W - inset * 2, H - inset * 2, style.radius * PX_PER_M);
    ctx.fillStyle = this.hovered && style.bg === PANEL.button ? PANEL.buttonHover : style.bg;
    ctx.fill();
    ctx.lineWidth = this.hovered ? 6 : 2.5;
    ctx.strokeStyle = this.hovered ? PANEL.focus : style.border;
    ctx.stroke();

    const size = style.size * PX_PER_M * textScale;
    ctx.textAlign = style.align;
    ctx.textBaseline = 'top';
    const x = style.align === 'center' ? W / 2 : pad;
    const lines: { text: string; font: string; color: string; lh: number }[] = [];
    if (this.content.title) {
      ctx.font = `500 ${size * 1.3}px ${FONT.display}`;
      for (const t of wrap(ctx, this.content.title, W - pad * 2)) lines.push({ text: t, font: ctx.font, color: style.accent, lh: size * 1.55 });
    }
    if (this.content.body) {
      ctx.font = `${style.weight} ${size}px ${FONT.body}`;
      for (const t of wrap(ctx, this.content.body, W - pad * 2)) lines.push({ text: t, font: ctx.font, color: style.fg, lh: size * 1.32 });
    }
    const total = lines.reduce((s, l) => s + l.lh, 0);
    // Optical centring: cap-height text sits a touch low in a 'top' baseline box.
    let y = Math.max(pad * 0.5, (H - total) / 2 + size * 0.06);
    for (const l of lines) {
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, x, y);
      y += l.lh;
    }
    this.tex.needsUpdate = true;
  }

  dispose() {
    live.delete(this);
    this.geometry.dispose();
    this.material.dispose();
    this.tex.dispose();
  }
}

export function makeButton(label: string, onSelect: () => void, w = 0.2, h = 0.07): Panel {
  const p = new Panel(w, h, { size: 0.025, bg: PANEL.button, border: 'rgba(244, 240, 230, 0.16)', weight: 600, radius: h / 2 }).set({ body: label });
  const sel: Selectable = { onSelect, onHover: (v) => p.setHovered(v) };
  p.userData.selectable = sel;
  p.userData.label = label;
  return p;
}

/** A soft radial glow shared by lanterns and recall bursts: muted gold, never orange. */
let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, LANTERN.glowCore);
  grd.addColorStop(0.22, LANTERN.glowMid);
  grd.addColorStop(1, LANTERN.glowEdge);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/**
 * Pairing panel: the code is the primary path (the wearer reads it and types it on the phone, since a
 * phone can't scan a QR shown inside the headset); the QR works when the view is cast or on desktop.
 * Ivory card, forest modules: high contrast for cameras, and the one light surface in the palace.
 */
export function makeQrPanel(text: string, caption: string): Panel {
  const p = new Panel(0.28, 0.34, { bg: PALETTE.ivory, border: PALETTE.gold, size: 0.022 });
  const { data, size } = encode(text, { border: 2 });
  const ctx = p.canvas.getContext('2d')!;
  p.draw();
  const W = p.canvas.width, px = Math.floor((W * 0.8) / size), off = Math.floor((W - px * size) / 2);
  ctx.fillStyle = PALETTE.forest;
  data.forEach((row, y) => row.forEach((on, x) => on && ctx.fillRect(off + x * px, off + y * px, px, px)));
  ctx.fillStyle = PALETTE.forest;
  ctx.font = `500 ${0.036 * PX_PER_M}px ${FONT.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(caption.split('').join(' '), W / 2, off + px * size + 0.012 * PX_PER_M);
  (p.material.map as THREE.Texture).needsUpdate = true;
  live.delete(p); // custom-drawn: a font redraw would erase the QR
  return p;
}
