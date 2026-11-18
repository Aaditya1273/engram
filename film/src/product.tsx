import React from 'react';
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile } from 'remotion';
import { BAR, C, Camera, Chip, inOut, Line, PinchRing, ramp, SANS, SERIF, useT, Wash } from './kit';
import build from './marks/build.json';
import recall from './marks/recall.json';
import worlds from './marks/worlds.json';
import language from './marks/language.json';

/**
 * The product, as it is: Atrium in a WebXR session on Meta's Immersive Web Emulation Runtime emulating a Meta
 * Quest 3, driven by head gaze and hand pinches (capture/take.mjs). Cuts are defined by the takes' own logged
 * events, and each segment's speed is set so it lands on the bar grid. Every real pinch inside a segment gets a
 * focus ring and a sound on its exact frame.
 */
type Mark = { t: number; kind: string; label: string };
const TAKES: Record<string, Mark[]> = { build: build.marks, recall: recall.marks, worlds: worlds.marks, language: language.marks };
/** The n-th mark of a kind (optionally whose label starts with `label`) in a take. */
const m = (take: string, kind: string, n = 0, label?: string) => {
  const hits = TAKES[take].filter((x) => x.kind === kind && (!label || x.label.startsWith(label)));
  const x = hits[n < 0 ? hits.length + n : n];
  if (!x) throw new Error(`no ${kind} #${n} ${label ?? ''} in ${take}`);
  return x.t;
};

type Seg = { take: string; from: number; to: number; bars: number; zoom?: [number, number, number, number]; line?: React.ReactNode; chip?: React.ReactNode; count?: [string, string, number] };
const SEGS: Seg[] = [
  { take: 'build', from: 0.9, to: m('build', 'pinch', 0) - 1.4, bars: 2.5, line: 'Put on your Quest. Look around.' },
  { take: 'build', from: m('build', 'pinch', 0) - 1.2, to: m('build', 'pinch', 1) + 0.9, bars: 3.5, line: 'Name what you need to remember.' },
  { take: 'build', from: m('build', 'built') - 2.0, to: m('build', 'built') + 1.8, bars: 2, line: 'Atrium builds the palace.', chip: '12 stops · in order' },
  { take: 'build', from: m('build', 'stop', 0) - 1.0, to: m('build', 'pinch', 4) + 0.4, bars: 6.5, line: 'A vivid scene on every pedestal.', count: ['stop', 'Stop', 12] },
  { take: 'build', from: m('build', 'pinch', 4) + 0.4, to: m('build', 'pinch', -1) + 0.6, bars: 5.5, line: 'Each one leads to the next.', count: ['stop', 'Stop', 12] },
  { take: 'recall', from: m('recall', 'pinch', 0) - 0.6, to: m('recall', 'pinch', 5) + 0.9, bars: 9, line: 'Then walk it from memory.', count: ['pinch', 'Recalled', 12] },
  { take: 'recall', from: m('recall', 'pinch', 5) + 0.6, to: m('recall', 'pinch', 5) + 3.0, bars: 2, zoom: [1.05, 1.75, 61, 84], line: 'No controllers. Just your hands.', chip: 'Hand tracking · gaze and pinch' },
  { take: 'recall', from: m('recall', 'prompt', 5) - 0.3, to: m('recall', 'pinch', 8) + 0.8, bars: 4, line: 'Faster every time.', count: ['pinch', 'Recalled', 12] },
  { take: 'recall', from: m('recall', 'prompt', 9) - 0.3, to: m('recall', 'pinch', -1) + 0.8, bars: 2.5, count: ['pinch', 'Recalled', 12] },
  { take: 'recall', from: m('recall', 'pinch', -1) + 0.5, to: Math.min(m('recall', 'done') - 0.4, m('recall', 'pinch', -1) + 5.5), bars: 2, line: <span>All twelve. <span style={{ color: C.goldHi }}>In order.</span></span> },
  { take: 'worlds', from: 0.2, to: m('worlds', 'world', 2) + 2.5, bars: 3.5, line: 'One palace. Three worlds.' },
  { take: 'language', from: m('language', 'pinch', 2) - 0.6, to: m('language', 'lang', 1) + 1.6, bars: 2, line: 'In five languages.' },
];

/** Where each segment starts in the chapter (seconds), and its playback rate. */
const PLAN = (() => {
  let at = 0;
  return SEGS.map((s) => {
    const dur = s.bars * BAR, rate = (s.to - s.from) / dur;
    const r = { ...s, at, dur, rate, i: SEGS.indexOf(s) };
    at += dur;
    return r;
  });
})();

/** Sounds the film places for this chapter (seconds from its start): a whoosh per cut, a tick per real pinch. */
export const PRODUCT_SFX: [string, number, number][] = PLAN.flatMap((s, i) => [
  ...(i ? [['whoosh', s.at - 0.12, 0.28] as [string, number, number]] : []),
  ...TAKES[s.take].filter((x) => x.kind === 'pinch' && x.t > s.from && x.t < s.to).map((x) => ['pinch', s.at + (x.t - s.from) / s.rate, 0.55] as [string, number, number]),
  ...(s.take === 'recall' && s.from > m('recall', 'pinch', -1) ? [['bloom', s.at + 0.15, 0.6] as [string, number, number]] : []),
]);

export const Product: React.FC<{ bars: number }> = ({ bars }) => {
  const total = PLAN.reduce((a, s) => a + s.dur, 0);
  if (Math.abs(total - bars * BAR) > 0.05) throw new Error(`product segments are ${(total / BAR).toFixed(2)} bars, want ${bars}`);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {PLAN.map((s, i) => (
        <Sequence key={i} from={Math.round(s.at * 60)} durationInFrames={Math.round(s.dur * 60) + 8}>
          <Segment s={s} last={i === PLAN.length - 1} />
        </Sequence>
      ))}
      <Hud />
    </AbsoluteFill>
  );
};

const Segment: React.FC<{ s: (typeof PLAN)[number]; last: boolean }> = ({ s, last }) => {
  const t = useT();
  // Each cut lands with a short scale-and-clear, the previous shot still underneath for its last frames.
  const inK = ramp(t, 0, 0.22);
  // Every shot moves: alternate push-ins and pull-backs on the pedestals, unless the segment names its own move.
  const [z0, z1, ox, oy] = s.zoom ?? (s.i % 2 ? [1.24, 1.06, 50, 60] : [1.06, 1.26, 50, 62]);
  const pinches = TAKES[s.take].filter((x) => x.kind === 'pinch' && x.t > s.from && x.t < s.to).map((x) => (x.t - s.from) / s.rate);
  const counted = s.count ? TAKES[s.take].filter((x) => x.kind === s.count![0] && !x.label.startsWith('Walk it') && x.t <= s.from + t * s.rate).length : 0;
  return (
    <AbsoluteFill style={{ opacity: inK, filter: `blur(${(1 - inK) * 10}px)` }}>
      <Camera dur={s.dur} push={0.05} seed={`seg${s.from}`}>
        <AbsoluteFill style={{ transform: `scale(${z0 + (z1 - z0) * ramp(t, 0, s.dur, inOut)})`, transformOrigin: `${ox}% ${oy}%` }}>
          <OffthreadVideo src={staticFile(`clips/${s.take}.mp4`)} startFrom={Math.round(s.from * 60)} playbackRate={s.rate} muted style={{ width: 1920, height: 1080 }} />
        </AbsoluteFill>
      </Camera>
      {/* The headset's lens edge, and a soft band at the top so the narrator reads over any scene. */}
      <AbsoluteFill style={{ boxShadow: 'inset 0 0 160px 60px rgba(0,0,0,0.75)', borderRadius: 60 }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(4,10,7,0.78) 0%, rgba(4,10,7,0) 26%)' }} />
      {pinches.map((p, i) => <PinchRing key={i} at={p} />)}
      {s.line && <Line text={s.line} at={0.12} out={s.dur + (last ? 0 : 0.05)} y={-412} size={48} weight={400} />}
      {s.chip && <Chip at={0.5} x={0} y={-330} size={24}>{s.chip}</Chip>}
      {s.count && counted > 0 && (
        <div style={{ position: 'absolute', right: 90, top: 70, fontFamily: SANS, color: C.ivory, textAlign: 'right' }}>
          <div style={{ fontSize: 22, letterSpacing: '0.14em', color: C.gold }}>{s.count[1].toUpperCase()}</div>
          <div style={{ fontFamily: SERIF, fontSize: 76, lineHeight: 1 }}>{Math.min(counted, s.count[2])}<span style={{ fontSize: 40, color: C.muted }}> / {s.count[2]}</span></div>
        </div>
      )}
      <Wash color="#000" o={last ? ramp(t, s.dur - 0.25, s.dur) * 0.6 : 0} />
    </AbsoluteFill>
  );
};

/** A small tag on the product chapter: the device, and the tool it runs in. */
const Hud: React.FC = () => {
  const t = useT();
  return (
    <div style={{ position: 'absolute', left: 80, top: 74, display: 'flex', alignItems: 'center', gap: 14, opacity: ramp(t, 0.4, 1.2), fontFamily: SANS }}>
      <div style={{ width: 12, height: 12, borderRadius: 6, background: '#E5484D', boxShadow: '0 0 12px #E5484D', opacity: 0.6 + 0.4 * Math.sin(t * 5) }} />
      <div style={{ color: C.ivory, fontSize: 22, letterSpacing: '0.12em' }}>META QUEST 3</div>
      <div style={{ color: C.muted, fontSize: 20 }}>· Meta Immersive Web Emulator</div>
    </div>
  );
};
