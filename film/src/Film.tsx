import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Aurora, BAR, bf, C, Camera, Chip, clamp, Drop, Finish, Fireflies, FPS, Glitch, Headset, inOut, Line, ramp, SANS, SERIF, useT, Wash } from './kit';
import { Product, PRODUCT_SFX } from './product';

/**
 * Atrium, for Meta Quest: the 3-minute film. No voice: one narrator line at a time carries the story.
 * Every scene sits on the bed's bar grid (127.75 BPM; bar 27 is the drop). The product chapter is Atrium itself,
 * recorded running in Meta's Immersive Web Emulation Runtime as a Meta Quest 3, driven by gaze and pinch.
 */
const S = { open: 0, intro: 4, pain: 9, old: 20, reveal: 27, product: 30, impact: 75, end: 88 } as const;
const len = (a: number, b: number) => bf(b) - bf(a);

export const Film: React.FC = () => (
  <AbsoluteFill style={{ background: C.deep }}>
    <Sequence from={bf(S.open)} durationInFrames={len(S.open, S.intro) + 2}><Open /></Sequence>
    <Sequence from={bf(S.intro)} durationInFrames={len(S.intro, S.pain) + 1}><Intro /></Sequence>
    <Sequence from={bf(S.pain)} durationInFrames={len(S.pain, S.old) + 1}><Pain /></Sequence>
    <Sequence from={bf(S.old)} durationInFrames={len(S.old, S.reveal) + 1}><Old /></Sequence>
    <Sequence from={bf(S.reveal)} durationInFrames={len(S.reveal, S.product) + 1}><Reveal /></Sequence>
    <Sequence from={bf(S.product)} durationInFrames={len(S.product, S.impact) + 1}><Product bars={S.impact - S.product} /></Sequence>
    <Sequence from={bf(S.impact)} durationInFrames={len(S.impact, S.end) + 1}><Impact /></Sequence>
    <Sequence from={bf(S.end)} durationInFrames={len(S.end, 96)}><End /></Sequence>
    <Finish />
    <Audio src={staticFile('audio/bed.wav')} />
    {SFX.map(([s, at, v], i) => <Sequence key={i} from={Math.round(at * FPS)} durationInFrames={60}><Audio src={staticFile(`audio/${s}.wav`)} volume={v} /></Sequence>)}
    {PRODUCT_SFX.map(([s, at, v], i) => <Sequence key={`p${i}`} from={bf(S.product) + Math.round(at * FPS)} durationInFrames={60}><Audio src={staticFile(`audio/${s}.wav`)} volume={v} /></Sequence>)}
  </AbsoluteFill>
);

const B = (bars: number) => bars * BAR;
/** UI sound at the film's own events (absolute seconds). */
const SFX: [string, number, number][] = [
  ['whoosh', B(2) - 0.15, 0.5], ['bloom', B(1), 0.35],
  ['whoosh', B(9.25), 0.4], ['type', B(10.5), 0.3], ['whoosh', B(14.5) - 0.1, 0.6], ['whoosh', B(20), 0.5], ['whoosh', B(22), 0.4],
  ['bloom', B(28.2), 0.5], ['whoosh', B(29.4), 0.7],
  ['whoosh', B(75), 0.5], ['bloom', B(77), 0.35], ['bloom', B(81), 0.35], ['bloom', B(88.1), 0.5],
];

/** 0:00 One lantern lights in the dark forest; ATRIUM resolves out of its light; the glitch hit on bar 4. */
const Open: React.FC = () => {
  const t = useT();
  const lit = 0.18 + 0.82 * ramp(t, 0.05, B(1.4));
  const title = ramp(t, B(2), B(2) + 1.1);
  const zoom = interpolate(t, [0, B(4)], [1.18, 1.0], clamp);
  return (
    <Glitch at={B(4) - 0.42} dur={0.42}>
      <AbsoluteFill style={{ background: C.deep }}>
        <AbsoluteFill style={{ transform: `scale(${zoom})`, opacity: 0.25 + 0.55 * lit }}>
          <Img src={staticFile('art/forest.webp')} style={{ width: 1920, height: 1080, objectFit: 'cover', filter: 'brightness(0.45) saturate(1.1)' }} />
        </AbsoluteFill>
        <Fireflies opacity={0.3 + 0.7 * lit} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: '50%', background: `radial-gradient(circle, ${C.goldHi}${lit > 0.5 ? '55' : '22'} 0%, transparent 60%)`, transform: `scale(${0.4 + lit})`, opacity: lit }} />
          <Img src={staticFile('art/lantern.png')} style={{ height: 520, opacity: 0.2 + 0.8 * lit, transform: `translateY(${-30 - title * 120}px) scale(${1 - title * 0.25})`, filter: `brightness(${0.4 + lit * 0.8}) drop-shadow(0 0 ${60 * lit}px ${C.gold})` }} />
        </AbsoluteFill>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', gap: 34, transform: `translateY(${200 - title * 20}px)` }}>
            {'ATRIUM'.split('').map((ch, i) => {
              const a = ramp(t, B(2) + i * 0.09, B(2) + i * 0.09 + 0.9);
              return <span key={i} style={{ fontFamily: SERIF, fontSize: 150, fontWeight: 500, color: C.goldHi, letterSpacing: '0.04em', opacity: a, filter: `blur(${(1 - a) * 20}px)`, transform: `translateY(${(1 - a) * 30}px)`, textShadow: `0 0 50px ${C.gold}aa` }}>{ch}</span>;
            })}
          </div>
        </AbsoluteFill>
        <Line text="A memory palace for Meta Quest" at={B(3)} size={30} y={330} color={C.gold} weight={400} />
      </AbsoluteFill>
    </Glitch>
  );
};

/** 0:07 The cinematic clip, under our bed; it ends in an overexposed bloom to white. */
const Intro: React.FC = () => {
  const t = useT();
  const end = B(5.04);
  const bloom = ramp(t, end - 0.9, end - 0.05, inOut);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Glitch at={0} dur={0.3}>
        <OffthreadVideo src={staticFile('clips/intro.mp4')} muted style={{ width: 1920, height: 1080, filter: `brightness(${1 + bloom * 3}) contrast(${1 - bloom * 0.4})` }} />
      </Glitch>
      <Wash color="#fff" o={bloom} />
      <Wash color={C.paper} o={ramp(t, end - 0.05, end + 0.3)} />
    </AbsoluteFill>
  );
};

/** 0:17 The problem everyone has: on paper, the way we study, fading on the forgetting curve. */
const Pain: React.FC = () => {
  const t = useT();
  const hl = ramp(t, B(1.6), B(2.1));
  const cards = ramp(t, B(3), B(3.6));
  const gone = t >= B(5.5) && t < B(6.6);
  const curve = ramp(t, B(6.8), B(9), inOut);
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Camera dur={B(11)} push={0.14} seed="pain">
        <Aurora colors={['#F2D58C', '#E8DCC0', '#D9C08A', '#EFE3C8']} opacity={0.55} />
        <AbsoluteFill style={{ backgroundImage: `radial-gradient(${C.ink}30 2.6px, transparent 2.6px)`, backgroundSize: '46px 46px', backgroundPosition: `${t * 38}px ${t * 22}px` }} />
        {t < B(5.4) && <>
          <Drop text="You read it." at={0.1} out={B(1.5)} color={C.ink} serif={false} size={96} />
          <Line text={<span>You <span style={{ background: `linear-gradient(90deg, #F2D58Cdd ${hl * 100}%, transparent ${hl * 100}%)`, padding: '0 10px', borderRadius: 8 }}>highlighted</span> it.</span>} at={B(1.5)} out={B(3)} color={C.ink} size={96} weight={500} />
          <Drop text="You made the flashcards." at={B(3)} out={B(4.4)} color={C.ink} serif={false} y={-250} size={84} pill={['flashcards.']} />
          {cards > 0 && t < B(4.6) && [0, 1, 2, 3, 4].map((i) => {
            const fall = ramp(t, B(3) + i * 0.12, B(3) + i * 0.12 + 0.6);
            return <div key={i} style={{ position: 'absolute', left: 960 - 170 + (i - 2) * 26, top: 470 - (1 - fall) * 500 + i * 8, width: 340, height: 210, borderRadius: 14, background: '#fff', border: `1.5px solid ${C.ink}22`, boxShadow: '0 18px 40px rgba(0,0,0,0.12)', transform: `rotate(${(i - 2) * 4}deg)`, opacity: fall, fontFamily: SANS, fontSize: 30, color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{['Olfactory', 'Optic', 'Oculomotor', 'Trochlear', 'Trigeminal'][i]}</div>;
          })}
          <Drop text="Two days later…" at={B(4.4)} out={B(5.5)} color={C.ink} serif={false} size={96} />
        </>}
        {gone && <Gone t0={B(5.5)} />}
        {t >= B(6.6) && <Curve p={curve} t={t - B(6.6)} />}
      </Camera>
    </AbsoluteFill>
  );
};

/** The punch: "gone." in giant type, its letters drifting away as dust. */
const Gone: React.FC<{ t0: number }> = ({ t0 }) => {
  const t = useT() - t0;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex' }}>
        {'gone.'.split('').map((ch, i) => {
          const d = Math.max(0, t - 0.7 - i * 0.08);
          return <span key={i} style={{ fontFamily: SERIF, fontSize: 380, fontWeight: 500, color: C.ink, letterSpacing: '-0.04em', opacity: Math.min(1, t * 4) * Math.max(0, 1 - d * 1.6), filter: `blur(${d * 26}px)`, transform: `translate(${d * (60 + i * 40) + Math.max(0, 1 - t * 2.4) ** 3 * 700}px, ${-d * 90}px) scale(${1 + d * 0.3}) perspective(1200px) rotateY(${-(Math.max(0, 1 - t * 2.4) ** 3) * 58}deg)`, display: 'inline-block' }}>{ch}</span>;
        })}
      </div>
    </AbsoluteFill>
  );
};

/** The forgetting curve draws itself; what we learned falls along it. */
const Curve: React.FC<{ p: number; t: number }> = ({ p, t }) => {
  const W = 1100, H = 440, x0 = 410, y0 = 720;
  const pts = Array.from({ length: 60 }, (_, i) => { const x = i / 59; return [x0 + x * W, y0 - H * (0.25 + 0.75 * Math.exp(-x * 5.2))]; });
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
  const len = 1500;
  const marks: [number, string][] = [[0.06, '20 min'], [0.2, '1 hour'], [0.45, '1 day'], [0.95, '1 week']];
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080}>
        <line x1={x0} y1={y0} x2={x0 + W} y2={y0} stroke={C.ink} strokeOpacity={0.3} strokeWidth={2} strokeDasharray={W} strokeDashoffset={W * (1 - Math.min(1, p * 3))} />
        <line x1={x0} y1={y0} x2={x0} y2={y0 - H - 20} stroke={C.ink} strokeOpacity={0.3} strokeWidth={2} />
        <path d={d} fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
        {marks.map(([x, l], i) => {
          const a = ramp(p, x * 0.9, x * 0.9 + 0.1, inOut);
          const y = y0 - H * (0.25 + 0.75 * Math.exp(-x * 5.2));
          return <g key={i} opacity={a}><circle cx={x0 + x * W} cy={y} r={11} fill={C.gold} /><text x={x0 + x * W} y={y0 + 46} textAnchor="middle" fontFamily={SANS} fontSize={26} fill={C.ink} opacity={0.7}>{l}</text></g>;
        })}
      </svg>
      {/* What we studied rides down the curve and fades as it goes. */}
      {['Your notes', 'The highlights', 'The flashcards', 'The lecture'].map((label, i) => {
        const q = Math.min(1, Math.max(0, (t - 0.4 - i * 0.9) / 3.2));
        if (q <= 0) return null;
        const x = q * 0.95, y = y0 - H * (0.25 + 0.75 * Math.exp(-x * 5.2));
        return <div key={label} style={{ position: 'absolute', left: x0 + x * W, top: y - 64, transform: 'translateX(-50%)', padding: '10px 20px', borderRadius: 12, background: '#fff', border: `1.5px solid ${C.ink}22`, boxShadow: '0 12px 30px rgba(0,0,0,0.12)', fontFamily: SANS, fontSize: 26, color: C.ink, opacity: 1 - q * 0.85, filter: `blur(${q * 6}px)`, whiteSpace: 'nowrap' }}>{label}</div>;
      })}
      <Drop text="Most of what we learn is gone within a day." at={0.5} size={66} y={-390} color={C.ink} serif={false} pill={['within', 'a', 'day.']} />
      <Line text="The forgetting curve · Ebbinghaus, 1885" at={1.6} size={22} y={420} color={C.muted} weight={400} />
    </AbsoluteFill>
  );
};

/** 0:38 The old answer: memory champions walk through a palace. It takes years to build one. */
const Old: React.FC = () => {
  const t = useT();
  const rise = ramp(t, B(0.9), B(2.6), inOut);
  return (
    <AbsoluteFill style={{ background: C.deep }}>
      <Camera dur={B(7)} push={0.1} seed="old">
        <Aurora opacity={0.7} />
        <Fireflies n={22} seed="o0" opacity={0.6} />
        <AbsoluteFill style={{ opacity: rise, transform: `translateY(${(1 - rise) * 160}px) scale(${1.05 + (1 - rise) * 0.1})` }}>
          <Img src={staticFile('art/rotunda.webp')} style={{ width: 1920, height: 1080, objectFit: 'cover', filter: 'brightness(0.62) saturate(1.05)' }} />
          <AbsoluteFill style={{ background: `linear-gradient(180deg, ${C.deep}cc 0%, transparent 35%, transparent 60%, ${C.deep}ee 100%)` }} />
        </AbsoluteFill>
        <Fireflies n={28} seed="o" opacity={rise} />
        <Drop text="Memory champions don't have better memories." at={0.1} out={B(1.7)} size={80} serif={false} />
        <Line text={<span>They walk through a <span style={{ color: C.goldHi, fontFamily: SERIF, fontWeight: 500 }}>palace.</span></span>} at={B(1.7)} out={B(4)} y={-330} size={64} />
        <Drop text="Every fact, a place. Every place, in order." at={B(4)} out={B(5.4)} y={-330} size={76} serif={false} gold={['place.', 'order.']} />
        <Drop text="It takes years to build one." at={B(5.4)} out={B(7.05)} y={-330} size={80} serif={false} pill={['years']} />
      </Camera>
    </AbsoluteFill>
  );
};

/** 0:51 THE DROP: "Now it takes one sentence." The Quest draws itself; the camera dives through the lens. */
const Reveal: React.FC = () => {
  const t = useT();
  const draw = ramp(t, B(1) - 0.1, B(2), inOut);
  const dive = ramp(t, B(2.45), B(3), (x) => x * x * x);
  return (
    <AbsoluteFill style={{ background: C.deep }}>
      <Aurora opacity={0.45 + 0.3 * draw} />
      <Fireflies n={30} seed="rv" opacity={0.7} />
      {t < B(1.05) && <>
        <Line text="Now it takes" at={0} out={B(1.05)} y={-130} size={60} />
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${1 + t * 0.05})` }}><Drop text="one sentence." at={0.02} size={200} gold={['sentence.']} y={40} swing /></div>
      </>}
      {t >= B(1) - 0.1 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `scale(${1 + dive * 9})`, transformOrigin: '670px 540px', opacity: 1 - ramp(t, B(2.85), B(3)) }}>
          <div style={{ transform: `translateY(-60px) perspective(1400px) rotateY(${Math.sin(t * 0.9) * 9}deg) rotateX(${Math.cos(t * 0.7) * 4}deg) scale(${1 + 0.06 * draw})` }}><Headset draw={draw} glow={ramp(t, B(2), B(2.4))} /></div>
          <div style={{ position: 'absolute', top: 760, textAlign: 'center' }}>
            <div style={{ fontFamily: SERIF, fontSize: 84, color: C.goldHi, opacity: ramp(t, B(1.4), B(1.9)), letterSpacing: '0.02em' }}>Atrium</div>
            <div style={{ fontFamily: SANS, fontSize: 30, color: C.ivory, opacity: ramp(t, B(1.7), B(2.1)), marginTop: 6, letterSpacing: '0.12em' }}>BUILT FOR META QUEST</div>
          </div>
        </AbsoluteFill>
      )}
      <Wash color={C.goldHi} o={ramp(t, B(2.8), B(2.95)) * (1 - ramp(t, B(2.95), B(3)))} blend="screen" />
    </AbsoluteFill>
  );
};

/** 2:21 What it does for you: the numbers, shown. */
const Impact: React.FC = () => {
  const t = useT();
  return (
    <AbsoluteFill style={{ background: C.deep }}>
      <Camera dur={B(13)} push={0.08} seed="imp">
        <Aurora opacity={0.5} />
        <Fireflies n={30} seed="i" opacity={0.6} />
        {t < B(4.5) && <>
          <Drop text="Five minutes. Ten elements. Forwards and backwards." at={0.15} out={B(4.5)} y={-300} size={70} serif={false} gold={['Ten', 'elements.']} />
          <Lanterns t={t} />
        </>}
        {t >= B(4.5) && t < B(8.6) && <>
          <Drop text="Spaced recall that never piles up." at={B(4.5) + 0.05} out={B(8.6)} y={-300} size={76} serif={false} pill={['never', 'piles', 'up.']} />
          <Fade t={t - B(4.5)} />
        </>}
        {t >= B(8.6) && <>
          <Drop text="Built for Meta Quest." at={B(8.6) + 0.05} y={-290} size={104} gold={['Meta', 'Quest.']} swing />
          <Chip size={34} at={B(9.4)} x={-470} y={20}>Hand tracking · pinch and gaze</Chip>
          <Chip size={34} at={B(9.8)} x={0} y={130}>Seated · comfortable · 72 fps</Chip>
          <Chip size={34} at={B(10.2)} x={470} y={20}>WebXR · works offline</Chip>
          <Chip size={34} at={B(10.8)} x={-270} y={260}>Five languages</Chip>
          <Chip size={34} at={B(11.2)} x={270} y={260}>Three worlds</Chip>
        </>}
      </Camera>
    </AbsoluteFill>
  );
};

/** Ten lanterns light in order, then back again: forwards and backwards. */
const Lanterns: React.FC<{ t: number }> = ({ t }) => {
  const els = ['H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne'];
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: 30, transform: 'translateY(40px)' }}>
        {els.map((e, i) => {
          const fw = ramp(t, B(0.6) + i * 0.16, B(0.6) + i * 0.16 + 0.25);
          const bw = ramp(t, B(2.4) + (9 - i) * 0.12, B(2.4) + (9 - i) * 0.12 + 0.2);
          const lit = Math.max(fw * (1 - ramp(t, B(2.1), B(2.3))), bw);
          return (
            <div key={e} style={{ width: 138, height: 200, borderRadius: 69, border: `2px solid ${C.gold}${lit > 0.5 ? '' : '66'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle at 50% 40%, ${C.goldHi}${Math.round(lit * 160).toString(16).padStart(2, '0')} 0%, transparent 70%)`, boxShadow: `0 0 ${50 * lit}px ${C.gold}${Math.round(lit * 200).toString(16).padStart(2, '0')}` }}>
              <div style={{ fontFamily: SERIF, fontSize: 52, color: lit > 0.4 ? C.deep : C.ivory, fontWeight: 600 }}>{e}</div>
              <div style={{ fontFamily: SANS, fontSize: 22, color: lit > 0.4 ? C.deep : C.muted }}>{i + 1}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** A week of review, as lanterns: a few dim each day and are relit; the count never grows. */
const Fade: React.FC<{ t: number }> = ({ t }) => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: 46, transform: 'translateY(60px)' }}>
        {days.map((d, i) => {
          const a = ramp(t, 0.4 + i * 0.35, 0.8 + i * 0.35);
          return (
            <div key={d} style={{ opacity: a, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, transform: `translateY(${(1 - a) * 30}px)` }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 36px)', gap: 12 }}>
                {[0, 1, 2, 3, 4, 5].map((k) => { const relit = ramp(t, 0.9 + i * 0.35 + k * 0.05, 1.2 + i * 0.35 + k * 0.05); return <div key={k} style={{ width: 36, height: 36, borderRadius: 18, background: k < 3 ? (relit > 0.5 ? C.goldHi : '#3a4a40') : C.goldHi, boxShadow: `0 0 14px ${C.gold}88` }} />; })}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 32, color: C.ivory }}>{d}</div>
            </div>
          );
        })}
      </div>
      <Line text="About two minutes a day. Miss one, and nothing piles up." at={2.6} size={42} y={320} color={C.gold} />
    </AbsoluteFill>
  );
};

/** 2:45 The end card, held over the outro. */
const End: React.FC = () => {
  const t = useT();
  const a = ramp(t, 0, 0.9);
  const caret = Math.floor(t * 2) % 2 === 0;
  return (
    <AbsoluteFill style={{ background: C.deep }}>
      <Camera dur={B(8)} push={0.05} seed="end">
        <Aurora opacity={0.5} />
        <Fireflies n={36} seed="e" />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', width: 820, height: 820, borderRadius: '50%', background: `radial-gradient(circle, ${C.goldHi}33 0%, transparent 60%)`, opacity: a }} />
          <Img src={staticFile('art/lantern.png')} style={{ height: 260, transform: `translateY(-210px) scale(${0.85 + 0.15 * a})`, opacity: a, filter: `drop-shadow(0 0 40px ${C.gold})` }} />
        </AbsoluteFill>
        <Drop text="ATRIUM" at={0.15} size={150} color={C.goldHi} y={20} />
        <Drop text="Walk through it. Never forget it." at={0.8} size={60} y={160} serif={false} weight={400} gold={['forget']} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ transform: 'translateY(270px)', opacity: ramp(t, 1.5, 2.1), padding: '16px 34px', borderRadius: 999, border: `1.5px solid ${C.gold}`, background: 'rgba(8,20,14,0.7)', fontFamily: SANS, fontSize: 40, color: C.ivory, letterSpacing: '0.02em' }}>
            atrium-b0r.pages.dev<span style={{ color: C.goldHi, opacity: caret ? 1 : 0 }}>▍</span>
          </div>
        </AbsoluteFill>
        <Line text="Built for Meta Quest · WebXR" at={2.3} size={32} y={395} color={C.gold} />
      </Camera>
    </AbsoluteFill>
  );
};
