import React from 'react';
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as loadSerif } from '@remotion/google-fonts/Fraunces';
import { loadFont as loadSans } from '@remotion/google-fonts/SourceSans3';

export const SERIF = loadSerif().fontFamily;
export const SANS = loadSans().fontFamily;

/** Atrium's palette: the forest palace at night, gold as the one accent. */
export const C = {
  deep: '#06100B', forest: '#0E2219', moss: '#1F4A3A', gold: '#D9B76E', goldHi: '#F2D58C', ivory: '#F4F0E6',
  paper: '#F3EEE2', ink: '#13261C', muted: '#7C8A80',
};

/** The bed: 127.75 BPM, a bar is four beats. Every scene and hit sits on this grid. */
export const FPS = 60;
export const BAR = 240 / 127.75;
export const BARS = 96;
export const bf = (bars: number) => Math.round(bars * BAR * FPS);
export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const useT = () => useCurrentFrame() / useVideoConfig().fps;
export const ramp = (t: number, a: number, b: number, e = ease) => interpolate(t, [a, b], [0, 1], { ...clamp, easing: e });

/** A camera that never rests: a slow push and a gentle float over the life of a scene. */
export const Camera: React.FC<{ push?: number; seed?: string; children: React.ReactNode; dur: number }> = ({ push = 0.08, seed = 'c', children, dur }) => {
  const t = useT();
  const k = Math.min(1, t / dur);
  const fx = Math.sin(t * 0.7 + random(seed) * 6) * 10, fy = Math.cos(t * 0.53 + random(seed + 'y') * 6) * 7;
  const rx = Math.sin(t * 0.41 + random(seed + 'r') * 6) * 1.6, ry = Math.cos(t * 0.37 + random(seed + 'q') * 6) * 2;
  return (
    <AbsoluteFill style={{ perspective: 1600 }}>
      <AbsoluteFill style={{ transform: `translate(${fx}px, ${fy}px) scale(${1 + push * k}) rotateX(${rx}deg) rotateY(${ry}deg)` }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

/** The narrator: a thin line that resolves out of a blur, and blurs away. Times in scene seconds. */
export const Line: React.FC<{ text: React.ReactNode; at: number; out?: number; size?: number; y?: number; color?: string; serif?: boolean; weight?: number; width?: number }> =
  ({ text, at, out = 1e9, size = 66, y = 0, color = C.ivory, serif = false, weight = 300, width = 1500 }) => {
    const t = useT();
    const a = ramp(t, at, at + 0.75), z = ramp(t, out - 0.35, out, Easing.in(Easing.quad));
    const v = a * (1 - z);
    if (v <= 0.001) return null;
    return (
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          transform: `translateY(${y + (1 - a) * 18 - z * 10}px)`, opacity: v, filter: `blur(${(1 - a) * 18 + z * 14}px)`, maxWidth: width,
          fontFamily: serif ? SERIF : SANS, fontWeight: weight, fontSize: size, color, textAlign: 'center', letterSpacing: serif ? '-0.01em' : '0.005em', lineHeight: 1.15,
        }}>{text}</div>
      </AbsoluteFill>
    );
  };

/** Words that drop in one by one with a small overshoot (the punch lines). */
export const Drop: React.FC<{ text: string; at: number; step?: number; size: number; color?: string; serif?: boolean; y?: number; gold?: string[] }> =
  ({ text, at, step = 0.11, size, color = C.ivory, serif = true, y = 0, gold = [] }) => {
    const f = useCurrentFrame(), { fps } = useVideoConfig();
    return (
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', gap: size * 0.26, transform: `translateY(${y}px)`, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 1700 }}>
          {text.split(' ').map((w, i) => {
            const s = (f / fps - at - i * step) * fps;
            const sp = s < 0 ? 0 : 1 - Math.exp(-s / 6) * Math.cos(s / 4.2);
            return (
              <span key={i} style={{
                fontFamily: serif ? SERIF : SANS, fontSize: size, fontWeight: serif ? 500 : 600, color: gold.includes(w) ? C.goldHi : color,
                opacity: Math.min(1, Math.max(0, s / 8)), filter: `blur(${Math.max(0, 10 - s)}px)`, display: 'inline-block',
                transform: `translateY(${(1 - sp) * 60}px)`, letterSpacing: '-0.02em', textShadow: gold.includes(w) ? `0 0 40px ${C.gold}88` : undefined,
              }}>{w}</span>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  };

/** A soft drifting aurora of gold and green: the light of the palace, behind the dark scenes. */
export const Aurora: React.FC<{ colors?: string[]; opacity?: number }> = ({ colors = [C.moss, '#3E6B3A', C.gold, '#2A5A45'], opacity = 0.55 }) => {
  const t = useT();
  return (
    <AbsoluteFill style={{ filter: 'blur(90px)', opacity }}>
      {colors.map((c, i) => {
        const x = 960 + Math.sin(t * 0.21 + i * 1.7) * 520, y = 540 + Math.cos(t * 0.17 + i * 2.3) * 300, r = 520 + i * 60;
        return <div key={i} style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%', background: `radial-gradient(circle, ${c} 0%, transparent 65%)`, opacity: i === 2 ? 0.45 : 0.8 }} />;
      })}
    </AbsoluteFill>
  );
};

/** Fireflies: golden motes drifting up, each on its own path. */
export const Fireflies: React.FC<{ n?: number; seed?: string; opacity?: number }> = ({ n = 46, seed = 'ff', opacity = 1 }) => {
  const t = useT();
  return (
    <AbsoluteFill style={{ opacity }}>
      {Array.from({ length: n }, (_, i) => {
        const r = (k: string) => random(`${seed}${i}${k}`);
        const x = r('x') * 1920 + Math.sin(t * (0.3 + r('s')) + r('p') * 6) * 40;
        const y = 1080 - ((r('y') * 1200 + t * (18 + r('v') * 30)) % 1250) + 80;
        const s = 3 + r('z') * 6, a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1 + r('f') * 2) + r('q') * 6));
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: s, height: s, borderRadius: '50%', background: C.goldHi, opacity: a, boxShadow: `0 0 ${s * 4}px ${s}px ${C.gold}99` }} />;
      })}
    </AbsoluteFill>
  );
};

/** The VFX hit: RGB split, horizontal tears and scanlines over `children`, for `dur` seconds from `at`. */
export const Glitch: React.FC<{ at: number; dur?: number; children: React.ReactNode }> = ({ at, dur = 0.45, children }) => {
  const t = useT(), f = useCurrentFrame();
  const on = t >= at && t < at + dur;
  if (!on) return <>{children}</>;
  const k = 1 - (t - at) / dur;
  const off = (s: string) => (random(`${s}${f}`) - 0.5) * 60 * k;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `translateX(${off('r')}px)`, mixBlendMode: 'screen', filter: 'url(#r)' }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ transform: `translateX(${off('g')}px)`, mixBlendMode: 'screen', filter: 'url(#g)' }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ transform: `translateX(${off('b')}px)`, mixBlendMode: 'screen', filter: 'url(#b)' }}>{children}</AbsoluteFill>
      {Array.from({ length: 7 }, (_, i) => {
        const y = random(`ty${i}${Math.floor(f / 2)}`) * 1080, h = 6 + random(`th${i}${f}`) * 50;
        return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: y, height: h, backdropFilter: `hue-rotate(${random(`hr${i}${f}`) * 180}deg)`, transform: `translateX(${off(`s${i}`) * 2}px)`, background: i % 3 === 0 ? `${C.gold}22` : 'transparent' }} />;
      })}
      <AbsoluteFill style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0 2px, transparent 2px 5px)', opacity: k }} />
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <filter id="r"><feColorMatrix values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" /></filter>
        <filter id="g"><feColorMatrix values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" /></filter>
        <filter id="b"><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" /></filter>
      </svg>
    </AbsoluteFill>
  );
};

/** A small chip: a fact or a label, in gold hairline. */
export const Chip: React.FC<{ children: React.ReactNode; at: number; x?: number; y?: number; dark?: boolean; size?: number }> = ({ children, at, x = 0, y = 0, dark = true, size = 26 }) => {
  const t = useT();
  const a = ramp(t, at, at + 0.5);
  if (a <= 0) return null;
  return (
    <div style={{
      position: 'absolute', left: 960 + x, top: 540 + y, transform: `translate(-50%, -50%) scale(${0.9 + 0.1 * a})`, opacity: a,
      padding: `${size * 0.42}px ${size * 0.9}px`, borderRadius: 999, border: `1.5px solid ${C.gold}`, whiteSpace: 'nowrap',
      background: dark ? 'rgba(8, 20, 14, 0.72)' : 'rgba(255,255,255,0.7)', color: dark ? C.ivory : C.ink,
      fontFamily: SANS, fontWeight: 500, fontSize: size, boxShadow: `0 0 30px ${C.gold}33`, backdropFilter: 'blur(8px)',
    }}>{children}</div>
  );
};

/** A gaze-and-pinch beat in the headset: a gold ring tightens on the centre of view and a ripple goes out. */
export const PinchRing: React.FC<{ at: number }> = ({ at }) => {
  const t = useT();
  const d = t - at;
  if (d < -0.35 || d > 0.9) return null;
  const close = ramp(t, at - 0.35, at, Easing.out(Easing.quad));
  const rip = ramp(t, at, at + 0.8, Easing.out(Easing.cubic));
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', width: 120 - 70 * close, height: 120 - 70 * close, borderRadius: '50%', border: `3px solid ${C.goldHi}`, opacity: d < 0 ? close : 1 - rip, boxShadow: `0 0 24px ${C.gold}` }} />
      <div style={{ position: 'absolute', width: 50 + 260 * rip, height: 50 + 260 * rip, borderRadius: '50%', border: `2px solid ${C.goldHi}`, opacity: d > 0 ? (1 - rip) * 0.9 : 0 }} />
      <div style={{ position: 'absolute', width: 12, height: 12, borderRadius: '50%', background: C.goldHi, opacity: d > 0 ? 1 - rip : close, boxShadow: `0 0 18px ${C.goldHi}` }} />
    </AbsoluteFill>
  );
};

/** The Meta Quest 3 as a line drawing (no logo): the visor, the lenses, the strap. `draw` 0..1 traces it. */
export const Headset: React.FC<{ draw: number; glow?: number; scale?: number }> = ({ draw, glow = 0, scale = 1 }) => {
  const L = 2600;
  const sty = (k: number): React.CSSProperties => ({ strokeDasharray: L, strokeDashoffset: L * (1 - Math.min(1, Math.max(0, draw * 1.3 - k * 0.3))) });
  return (
    <svg viewBox="0 0 1000 520" width={1000 * scale} height={520 * scale} style={{ overflow: 'visible', filter: `drop-shadow(0 0 ${20 + glow * 40}px ${C.gold}${glow > 0.5 ? 'cc' : '66'})` }}>
      <g fill="none" stroke={C.goldHi} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <path style={sty(0)} d="M140 170 C140 110 210 80 300 78 L700 78 C790 80 860 110 860 170 L860 330 C860 400 800 440 720 440 L600 440 C560 440 540 400 500 400 C460 400 440 440 400 440 L280 440 C200 440 140 400 140 330 Z" />
        <path style={sty(0.3)} d="M180 190 C180 140 230 120 300 120 L700 120 C770 120 820 140 820 190 L820 310 C820 370 780 400 720 400 L620 400 C580 400 560 365 500 365 C440 365 420 400 380 400 L280 400 C220 400 180 370 180 310 Z" opacity={0.55} />
        <circle style={sty(0.5)} cx={330} cy={260} r={58} opacity={0.8} />
        <circle style={sty(0.5)} cx={670} cy={260} r={58} opacity={0.8} />
        <path style={sty(0.7)} d="M140 230 C60 240 30 260 20 300 M860 230 C940 240 970 260 980 300" opacity={0.5} />
        <path style={sty(0.8)} d="M300 150 L350 150 M650 150 L700 150" opacity={0.6} />
      </g>
    </svg>
  );
};

/** A full-frame wash of colour (the white flash, or a fade), 0..1. */
export const Wash: React.FC<{ color: string; o: number; blend?: React.CSSProperties['mixBlendMode'] }> = ({ color, o, blend }) => (o > 0.001 ? <AbsoluteFill style={{ background: color, opacity: o, mixBlendMode: blend }} /> : null);

/** Film grain and a soft vignette over everything, so flat colour never looks digital. */
export const Finish: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 62%, rgba(0,0,0,0.26) 100%)' }} />
      <AbsoluteFill style={{ opacity: 0.06, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='${f % 9}'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />
    </AbsoluteFill>
  );
};
