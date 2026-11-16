import * as THREE from 'three';

/** Anything with userData.selectable is a gaze/pointer target. */
export interface Selectable {
  onSelect: () => void;
  onHover?: (hovered: boolean) => void;
}

const PX_PER_M = 1400;
export const UI_FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';
let textScale = 1;
/** Accessibility: larger text everywhere. Panels pick it up on their next draw. */
export const setTextScale = (s: number) => (textScale = s);

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
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
  accent?: string;
  size?: number;
  align?: CanvasTextAlign;
  radius?: number;
}

/** A flat text panel drawn to a canvas texture. Always faces where it was placed; never billboards. */
export class Panel extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private style: Required<PanelStyle>;
  private content: { title?: string; body?: string } = {};
  hovered = false;

  constructor(readonly w: number, readonly h: number, style: PanelStyle = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * PX_PER_M);
    canvas.height = Math.round(h * PX_PER_M);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    super(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.tex = tex;
    this.style = {
      bg: 'rgba(24,18,12,0.86)', fg: '#f6ead6', accent: '#ffcf7a', size: 0.03, align: 'center', radius: 0.02, ...style,
    };
    this.renderOrder = 10;
  }

  set(content: { title?: string; body?: string }) {
    this.content = content;
    this.draw();
    return this;
  }

  setHovered(h: boolean) {
    if (h === this.hovered) return;
    this.hovered = h;
    this.draw();
  }

  draw() {
    const { ctx, canvas, style } = this;
    const W = canvas.width, H = canvas.height, pad = 0.025 * PX_PER_M;
    ctx.clearRect(0, 0, W, H);
    roundRect(ctx, 4, 4, W - 8, H - 8, style.radius * PX_PER_M);
    ctx.fillStyle = style.bg;
    ctx.fill();
    if (this.hovered) {
      ctx.lineWidth = 8;
      ctx.strokeStyle = style.accent;
      ctx.stroke();
    }
    const size = style.size * PX_PER_M * textScale;
    ctx.textAlign = style.align;
    ctx.textBaseline = 'top';
    const x = style.align === 'center' ? W / 2 : pad;
    const lines: { text: string; font: string; color: string; lh: number }[] = [];
    if (this.content.title) {
      ctx.font = `600 ${size * 1.25}px ${UI_FONT}`;
      for (const t of wrap(ctx, this.content.title, W - pad * 2))
        lines.push({ text: t, font: ctx.font, color: style.accent, lh: size * 1.5 });
    }
    if (this.content.body) {
      ctx.font = `400 ${size}px ${UI_FONT}`;
      for (const t of wrap(ctx, this.content.body, W - pad * 2))
        lines.push({ text: t, font: ctx.font, color: style.fg, lh: size * 1.3 });
    }
    const total = lines.reduce((s, l) => s + l.lh, 0);
    let y = Math.max(pad * 0.5, (H - total) / 2);
    for (const l of lines) {
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, x, y);
      y += l.lh;
    }
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.tex.dispose();
  }
}

export function makeButton(label: string, onSelect: () => void, w = 0.2, h = 0.07): Panel {
  const p = new Panel(w, h, { size: 0.026, bg: 'rgba(58,40,22,0.92)' }).set({ body: label });
  const sel: Selectable = { onSelect, onHover: (v) => p.setHovered(v) };
  p.userData.selectable = sel;
  p.userData.label = label;
  return p;
}

/** A soft radial glow texture shared by lanterns and bursts. */
let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,230,170,1)');
  grd.addColorStop(0.25, 'rgba(255,190,90,0.55)');
  grd.addColorStop(1, 'rgba(255,160,60,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
