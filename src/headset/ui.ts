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

/**
 * The fill of captions, buttons and round controls, as RGB: top and bottom of the gradient, and the same when
 * hovered. Each world has its own (setUiTone); text and gold rims stay the same everywhere.
 */
type Rgb = [number, number, number];
export interface UiTone { top: Rgb; bottom: Rgb; hoverTop: Rgb; hoverBottom: Rgb }
export const UI_TONES = {
  garden: { top: [30, 70, 54], bottom: [14, 38, 29], hoverTop: [44, 96, 74], hoverBottom: [22, 58, 44] },
  moonlit: { top: [34, 44, 92], bottom: [14, 18, 44], hoverTop: [52, 66, 128], hoverBottom: [26, 32, 72] },
  sakura: { top: [122, 52, 80], bottom: [74, 26, 47], hoverTop: [150, 70, 102], hoverBottom: [98, 38, 64] },
} satisfies Record<string, UiTone>;
let tone: UiTone = UI_TONES.garden;
const rgba = (c: Rgb, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
/** The current world's panel colours as CSS, for the few HTML controls laid over the canvas. */
export const uiToneCss = () => ({ bg: rgba(tone.bottom, 0.95), raised: rgba(tone.top, 0.97), hover: rgba(tone.hoverTop, 0.98) });

/** Recolours every panel for a world (an unknown world keeps the garden's green). */
export const setUiTone = (world: string) => {
  tone = (UI_TONES as Record<string, UiTone>)[world] ?? UI_TONES.garden;
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

/** The gold leaf emblem, crowning ornate panels. */
let emblem: HTMLImageElement | null = null;
if (typeof Image !== 'undefined') {
  const img = new Image();
  img.onload = () => {
    emblem = img;
    live.forEach((p) => p.draw());
  };
  img.src = `${import.meta.env.BASE_URL}art/palace/emblem.webp`;
}

/** A rectangle whose corners are scooped inward, like the mockup's caption card. */
function notched(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w, y, r, Math.PI, Math.PI / 2, true);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w, y + h, r, (3 * Math.PI) / 2, Math.PI, true);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x, y + h, r, 0, (3 * Math.PI) / 2, true);
  ctx.lineTo(x, y + r);
  ctx.arc(x, y, r, Math.PI / 2, 0, true);
  ctx.closePath();
}

const diamond = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - s, y);
  ctx.closePath();
};

/**
 * Splits a paragraph into units a line may break between: words (with their following space) for Latin text,
 * single characters for Chinese and Japanese, which have no spaces. Closing punctuation stays on its character.
 */
const BREAKS = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff][，。、！？；：」』）》]?|[^\s\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]+\s*|\s+/g;

export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const unit of para.match(BREAKS) ?? []) {
      const test = line + unit;
      if (ctx.measureText(test.trimEnd()).width > maxW && line.trim()) {
        out.push(line.trimEnd());
        line = unit.trimStart();
      } else line = test;
    }
    out.push(line.trimEnd());
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
  /** Pill buttons in a menu: 'primary' is the filled gold main action, 'selected' the choice currently shown. */
  variant?: 'primary' | 'selected';
  /**
   * 'ornate': the caption card (notched corners, double gold frame, leaf crest). 'round': a circular gold-ringed
   * button. 'pill': a button or plaque, glowing gold rim, one line of text that shrinks to fit rather than wrap.
   */
  frame?: 'plain' | 'ornate' | 'round' | 'pill';
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
  private style: Required<Omit<PanelStyle, 'variant'>> & Pick<PanelStyle, 'variant'>;
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
      bg: PANEL.bg, fg: PANEL.fg, accent: PANEL.title, border: PANEL.hairline, size: 0.03, align: 'center', radius: 0.018, weight: 400, frame: 'plain',
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
    // Text is laid out in [top, bottom]; the ornate frame reserves room for its crest and divider.
    let top = 0, bottom = H;
    if (style.frame === 'ornate') [top, bottom] = this.drawOrnate();
    else if (style.frame === 'round') this.drawRound();
    else if (style.frame === 'pill') return this.drawPill();
    else {
      ctx.beginPath();
      ctx.roundRect(inset, inset, W - inset * 2, H - inset * 2, style.radius * PX_PER_M);
      // Panels on the default fill follow the world's tone; ones given their own colour keep it.
      ctx.fillStyle = this.hovered && style.bg === PANEL.button ? rgba(tone.hoverTop, 0.98) : style.bg === PANEL.bg || style.bg === PANEL.button ? rgba(tone.bottom, 0.92) : style.bg;
      ctx.fill();
      ctx.lineWidth = this.hovered ? 6 : 2.5;
      ctx.strokeStyle = this.hovered ? PANEL.focus : style.border;
      ctx.stroke();
    }
    if (style.frame === 'round') {
      this.tex.needsUpdate = true;
      return;
    }

    const size = style.size * PX_PER_M * textScale;
    ctx.textAlign = style.align;
    ctx.textBaseline = 'top';
    const x = style.align === 'center' ? W / 2 : pad;
    const lines: { text: string; font: string; color: string; lh: number }[] = [];
    if (this.content.title) {
      ctx.font = style.frame === 'ornate' ? `600 ${size * 1.6}px ${FONT.display}` : `500 ${size * 1.3}px ${FONT.display}`;
      for (const t of wrap(ctx, this.content.title, W - pad * 2)) lines.push({ text: t, font: ctx.font, color: style.accent, lh: size * (style.frame === 'ornate' ? 1.85 : 1.55) });
    }
    if (this.content.body) {
      ctx.font = `${style.weight} ${size}px ${FONT.body}`;
      for (const t of wrap(ctx, this.content.body, W - pad * 2)) lines.push({ text: t, font: ctx.font, color: style.fg, lh: size * 1.32 });
    }
    const total = lines.reduce((s, l) => s + l.lh, 0);
    // Optical centring: cap-height text sits a touch low in a 'top' baseline box.
    let y = Math.max(top + pad * 0.5, top + (bottom - top - total) / 2 + size * 0.06);
    for (const l of lines) {
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, x, y);
      y += l.lh;
    }
    this.tex.needsUpdate = true;
  }

  /** The caption card: forest panel, scooped corners, glowing double gold frame, leaf crest, diamond divider. */
  private drawOrnate(): [number, number] {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const crest = 0.034 * PX_PER_M, glow = 16, r = 0.022 * PX_PER_M;
    const x = glow, y = crest * 0.55, w = W - glow * 2, h = H - y - glow;
    notched(ctx, x, y, w, h, r);
    const fill = ctx.createLinearGradient(0, y, 0, y + h);
    fill.addColorStop(0, rgba(tone.top, 0.97));
    fill.addColorStop(1, rgba(tone.bottom, 0.97));
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.save();
    ctx.shadowColor = 'rgba(233, 196, 120, 0.85)';
    ctx.shadowBlur = glow;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#D9B76E';
    ctx.stroke();
    ctx.restore();
    const i = 11;
    notched(ctx, x + i, y + i, w - i * 2, h - i * 2, r - i * 0.6);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(217, 183, 110, 0.75)';
    ctx.stroke();
    // Crest: the gold leaves astride the top edge, with a short flourish either side.
    ctx.strokeStyle = '#D9B76E';
    ctx.lineWidth = 2.5;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + d * crest * 0.7, y);
      ctx.quadraticCurveTo(W / 2 + d * crest * 1.4, y - crest * 0.18, W / 2 + d * crest * 2.2, y);
      ctx.stroke();
    }
    if (emblem) {
      const ew = crest * 1.25, eh = (ew * emblem.height) / emblem.width;
      ctx.drawImage(emblem, W / 2 - ew / 2, y - eh * 0.62, ew, eh);
    }
    // Divider near the foot: hairline, diamond, hairline; and a diamond set into the bottom edge.
    const dy = y + h - 0.03 * PX_PER_M;
    ctx.fillStyle = ctx.strokeStyle = 'rgba(217, 183, 110, 0.8)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(W / 2 - w * 0.22, dy);
    ctx.lineTo(W / 2 - 12, dy);
    ctx.moveTo(W / 2 + 12, dy);
    ctx.lineTo(W / 2 + w * 0.22, dy);
    ctx.stroke();
    diamond(ctx, W / 2, dy, 6);
    ctx.stroke();
    diamond(ctx, W / 2, y + h, 8);
    ctx.fillStyle = '#E2C27A';
    ctx.fill();
    return [y + i, dy - 6];
  }

  /** Pill: forest gradient, glowing gold rim and inner hairline, one centred line of ivory text sized to fit. */
  private drawPill() {
    const { ctx, canvas, style } = this;
    const W = canvas.width, H = canvas.height, glow = 10, x = glow, y = glow, w = W - glow * 2, h = H - glow * 2, r = h / 2;
    const lift = ease(this.hoverT);
    const primary = style.variant === 'primary', lit = this.hovered || style.variant === 'selected';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    const fill = ctx.createLinearGradient(0, y, 0, y + h);
    if (primary) {
      fill.addColorStop(0, this.hovered ? '#FFE7A8' : '#F0D48F');
      fill.addColorStop(1, this.hovered ? '#D9A64E' : '#C3923F');
    } else {
      fill.addColorStop(0, lit ? rgba(tone.hoverTop, 0.98) : rgba(tone.top, 0.96));
      fill.addColorStop(1, lit ? rgba(tone.hoverBottom, 0.98) : rgba(tone.bottom, 0.96));
    }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.save();
    ctx.shadowColor = 'rgba(233, 196, 120, 0.9)';
    ctx.shadowBlur = primary || style.variant === 'selected' ? 18 : this.hovered ? 14 : 7;
    ctx.lineWidth = style.variant === 'selected' ? 5.5 : this.hovered ? 4.5 : 3;
    ctx.strokeStyle = primary ? '#FFF1C7' : style.variant === 'selected' ? '#F2D58C' : '#D9B76E';
    ctx.stroke();
    ctx.restore();
    const i = 6;
    ctx.beginPath();
    ctx.roundRect(x + i, y + i, w - i * 2, h - i * 2, r - i);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = `rgba(217, 183, 110, ${0.45 + 0.3 * lift})`;
    ctx.stroke();
    const text = this.content.body ?? this.content.title ?? '';
    let size = style.size * PX_PER_M * textScale;
    const room = w - r * 1.1;
    ctx.font = `${style.weight} ${size}px ${FONT.body}`;
    const tw = ctx.measureText(text).width;
    if (tw > room) {
      size *= room / tw;
      ctx.font = `${style.weight} ${size}px ${FONT.body}`;
    }
    ctx.fillStyle = primary ? '#2A1D08' : lit ? '#FFFDF6' : style.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, H / 2 + size * 0.04);
    this.tex.needsUpdate = true;
  }

  /** A round button: dark green disc, glowing gold ring, compass ticks, and a drawn arrow for ‹ / ›. */
  private drawRound() {
    const { ctx, canvas } = this;
    const W = canvas.width, c = W / 2, R = c - 14;
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.fillStyle = this.hovered ? rgba(tone.top, 0.92) : rgba(tone.bottom, 0.78);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = 'rgba(233, 196, 120, 0.9)';
    ctx.shadowBlur = this.hovered ? 16 : 9;
    ctx.lineWidth = this.hovered ? 6 : 4;
    ctx.strokeStyle = '#D9B76E';
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#D9B76E';
    ctx.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * (R + 4), c + Math.sin(a) * (R + 4));
      ctx.lineTo(c + Math.cos(a) * (R + 12), c + Math.sin(a) * (R + 12));
      ctx.stroke();
    }
    const label = this.content.body ?? '';
    const dir = label === '‹' ? -1 : label === '›' ? 1 : 0;
    if (dir) {
      const s = R * 0.42;
      ctx.lineWidth = 6;
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(c - dir * s, c);
      ctx.lineTo(c + dir * s, c);
      ctx.moveTo(c + dir * s * 0.25, c - s * 0.65);
      ctx.lineTo(c + dir * s, c);
      ctx.lineTo(c + dir * s * 0.25, c + s * 0.65);
      ctx.stroke();
    } else {
      ctx.fillStyle = PANEL.fg;
      ctx.font = `600 ${R * 0.8}px ${FONT.body}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, c, c);
    }
  }

  dispose() {
    live.delete(this);
    this.geometry.dispose();
    this.material.dispose();
    this.tex.dispose();
  }
}

/** Button width that fits its label on one line at the standard size, within sensible bounds (metres). */
export const buttonWidth = (label: string) => Math.min(0.28, Math.max(0.13, 0.07 + label.length * 0.0118));

export function makeButton(label: string, onSelect: () => void, w = 0.2, h = 0.07, style: PanelStyle = {}): Panel {
  const p = new Panel(w, h, { size: 0.026, weight: 600, frame: 'pill', ...style }).set({ body: label });
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
