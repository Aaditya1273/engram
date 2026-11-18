"""Atrium's own bed for the Meta film, written to the measured shape of vedio/refrance.mp3 (about 85% alike).

Kept from the reference (film/music/ana.py, grid.py): 127.75 BPM; a near-silent filtered open; a sub build;
a melodic section with no sub (bars 13-26 there, 9-27 here); THE DROP ON BAR 27; a long sub-heavy drop
(sub ~45% / low ~44% of energy, ~ -8.5 dB a bar) whose second half is denser (four-on-the-floor, 16th hats,
snare rolls); a sub-less outro. Ours: D minor, i-VI-III-VII (Dm Bb F C) a chord a bar, the lantern-bell motif,
every sound, and the film's structural hits (glitch at bar 4, white flash at bar 9, drop at 27, end card at 88).
Also writes the UI sound effects the edit places at its own events.

Run: ~/TY/.venv/bin/python3 compose_atrium.py ../public/audio
"""
import os, sys, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
BPM = 127.75
BEAT = 60 / BPM
BAR = 4 * BEAT
STEP = BAR / 16
BARS = 96
N = int((BARS * BAR + 3.0) * SR)
rng = np.random.default_rng(27)
DRY = np.zeros((2, N)); SEND = np.zeros((2, N)); SIDE = np.ones(N)

def at(bar, step=0.0): return bar * BAR + step * STEP
def tt(d): return np.arange(int(d * SR)) / SR
def lp(x, f, o=2): return sosfilt(butter(o, min(f, SR / 2 - 100), 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
def env(n, a=0.005, d=None, r=0.05):
    t = np.arange(n) / SR; e = np.minimum(1, t / max(a, 1e-4))
    if d: e *= np.exp(-t / d)
    rr = int(r * SR)
    if rr and n > rr: e[-rr:] *= np.linspace(1, 0, rr)
    return e
def put(sig, time, g=1.0, pan=0.0, send=0.0, duck=True):
    i = int(time * SR)
    if i >= N or i < 0: return
    s = sig[: N - i] * g
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    if not duck:
        DRY[0, i:i + len(s)] += s * l; DRY[1, i:i + len(s)] += s * r
    else:
        DUCKED[0, i:i + len(s)] += s * l; DUCKED[1, i:i + len(s)] += s * r
    if send: SEND[0, i:i + len(s)] += s * l * send; SEND[1, i:i + len(s)] += s * r * send
DUCKED = np.zeros((2, N))

# ---- instruments ----
def kick(g=1.0, low=45):
    t = tt(0.42); f = low + 105 * np.exp(-t / 0.035)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
    s += 0.5 * hp(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.004)
    return np.tanh(1.6 * s) * g
def sub808(f0, dur, glide=None):
    t = tt(dur); f = np.full(len(t), f0)
    if glide: f = f0 + (glide - f0) * np.exp(-t / 0.06)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR)
    body = 0.75 * np.tanh(3.2 * s) + 1.0 * lp(2 * ((np.cumsum(2 * f) / SR) % 1) - 1, 240, 2)  # sub plus a mid-bass layer
    return body * env(len(t), 0.004, None, 0.08) * np.exp(-t / (dur * 1.4))
def clap(g=1.0):
    n = int(0.3 * SR); s = np.zeros(n); x = rng.standard_normal(n)
    for k, dl in enumerate([0, 0.011, 0.022]):
        i = int(dl * SR); s[i:] += x[: n - i] * np.exp(-np.arange(n - i) / SR / (0.006 if k < 2 else 0.11))
    return bp(s, 900, 5200) * 0.9 * g
def snare(g=1.0):
    t = tt(0.22)
    return (0.6 * bp(rng.standard_normal(len(t)), 1500, 7000) * np.exp(-t / 0.07) + 0.5 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.04)) * g
def hat(open_=False, g=1.0):
    t = tt(0.25 if open_ else 0.06)
    return hp(rng.standard_normal(len(t)), 7500, 4) * np.exp(-t / (0.09 if open_ else 0.012)) * g
def saw(f, n, det=0.0):
    ph = np.cumsum(np.full(n, f * (1 + det))) / SR
    return 2 * (ph % 1) - 1
def pad(freqs, dur, cut=1800, att=0.25):
    n = int(dur * SR); s = np.zeros(n)
    for f in freqs:
        for d in (-0.006, 0, 0.007): s += saw(f, n, d)
    return lp(s / (len(freqs) * 3), cut, 2) * env(n, att, None, 0.35)
def bell(f, dur=1.6, g=1.0):
    t = tt(dur); I = 2.6 * np.exp(-t / 0.35)
    return np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * 3.5 * t)) * np.exp(-t / 0.55) * env(len(t), 0.002, None, 0.1) * g
def pluck(f, dur=0.5, g=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    x = saw(f, n) + 0.6 * saw(f, n, 0.004); k = np.exp(-t / 0.06)  # bright attack fading to a dark body
    return (lp(x, 5500, 1) * k + lp(x, 900, 1) * (1 - k)) * np.exp(-t / 0.18) * g
def noise_sweep(dur, f0, f1, g=1.0, up=True):
    n = int(dur * SR); x = rng.standard_normal(n); out = np.zeros(n); k = 2048
    for i in range(0, n, k):
        p = i / n; fc = f0 * (f1 / f0) ** (p if up else 1 - p)
        out[i:i + k] = bp(x[i:i + k], max(60, fc * 0.6), min(SR / 2 - 200, fc * 1.6), 1)
    e = np.linspace(0.05, 1, n) ** 2 if up else np.linspace(1, 0.0, n) ** 1.5
    return out * e * g
def impact(g=1.0):
    t = tt(2.4); f = 30 + 50 * np.exp(-t / 0.08)
    boom = np.tanh(2 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-t / 0.7)
    crash = hp(rng.standard_normal(len(t)), 1800) * np.exp(-t / 0.5) * 0.35
    return (boom + crash) * env(len(t), 0.001, None, 0.3) * g
def reverse_swell(dur=1.6, g=1.0):
    return noise_sweep(dur, 400, 9000, g)[::1] * 0.8
def glitch(g=1.0):
    n = int(0.55 * SR); s = np.zeros(n); i = 0
    while i < n:
        L_ = int(rng.uniform(0.012, 0.05) * SR); f = rng.choice([110, 220, 880, 1760, 3520])
        seg = np.sign(np.sin(2 * np.pi * f * np.arange(L_) / SR)) * rng.uniform(0.3, 1)
        if rng.random() < 0.4: seg = np.round(rng.standard_normal(L_) * 3) / 3
        s[i:i + L_] = seg[: n - i]; i += L_ + int(rng.uniform(0, 0.02) * SR)
    return bp(s, 200, 8000) * np.exp(-np.arange(n) / SR / 0.35) * g

# ---- harmony ----
D1, F1, BB1, C1 = 36.71, 43.65, 58.27, 32.70
ROOTS = [D1, BB1, F1, C1]
CHORDS = [[146.83, 174.61, 220.0, 293.66], [116.54, 146.83, 174.61, 233.08], [174.61, 220.0, 261.63, 349.23], [130.81, 164.81, 196.0, 261.63]]
MOTIF = [(0, 587.33), (3, 698.46), (6, 659.26), (8, 587.33), (11, 523.25), (14, 440.0), (16, 587.33), (19, 880.0), (22, 783.99), (24, 698.46), (27, 659.26), (30, 587.33)]  # (8th, Hz) over 2 bars

def section(b):
    if b < 4: return 'open'
    if b < 9: return 'build'
    if b < 20: return 'pain'
    if b < 27: return 'old'
    if b < 43: return 'drop'
    if b < 59: return 'dense'
    if b < 61: return 'break'
    if b < 75: return 'drop2'
    if b < 88: return 'impact'
    return 'outro'

for b in range(BARS):
    s = section(b); c = b % 4; T = at(b)
    # pads everywhere, brightness by section
    cut = {'open': 500, 'build': 900, 'pain': 1600, 'old': 2200, 'drop': 1200, 'dense': 1500, 'break': 900, 'drop2': 1700, 'impact': 1500, 'outro': 900}[s]
    pg = {'open': 0.22, 'build': 0.16, 'pain': 0.2, 'old': 0.26, 'drop': 0.2, 'dense': 0.2, 'break': 0.22, 'drop2': 0.2, 'impact': 0.2, 'outro': 0.22}[s]
    put(pad(CHORDS[c], BAR + 0.3, cut), T, pg * 0.55, 0, 0.5)
    # bell motif
    if s in ('open', 'old', 'break', 'drop2', 'impact', 'outro') and not (s == 'open' and b == 0):
        for e8, f in MOTIF:
            if (e8 // 16) == (b % 2):
                put(lp(bell(f / 2, 1.4), 2600), T + (e8 % 16) * BEAT / 2, 0.11 if s != 'drop2' else 0.07, 0.25 if e8 % 2 else -0.25, 0.6, duck=False)
    # plucked arps in the melodic section
    if s in ('pain', 'old'):
        notes = CHORDS[c] + [CHORDS[c][1] * 2]
        for k in range(8):
            put(pluck(notes[(k * 2 + b) % len(notes)], 0.45), T + k * BEAT / 2, 0.09, -0.4 + 0.8 * (k % 2), 0.35)
    # drums
    K, CL, SN, HAT, OH = [], [], [], [], []
    if s == 'build': K = [0, 8]; HAT = [4, 12] if b >= 6 else []
    if s == 'pain': K = [0, 10]; SN = [4, 12]; HAT = [2, 6, 10, 14]
    if s == 'old': K = [0, 10]; CL = [4, 12]; HAT = list(range(2, 16, 4)) + list(range(0, 16, 4)) if b >= 23 else [2, 6, 10, 14]
    if s == 'drop': K = [0, 7, 10]; CL = [8]; HAT = list(range(0, 16, 2)); OH = [14] if b % 2 else []
    if s in ('dense', 'drop2'): K = [0, 4, 8, 12]; CL = [4, 12]; HAT = list(range(16)); OH = [2, 10]
    if s == 'impact': K = [0, 10] if b < 86 else [0]; CL = [8]; HAT = list(range(0, 16, 2))
    for st in K: put(kick(low=45 if s not in ('pain', 'old', 'build') else 75), at(b, st), 1.15, 0, 0, duck=False); SIDE[int(at(b, st) * SR): int(at(b, st) * SR) + int(0.16 * SR)] = np.minimum(SIDE[int(at(b, st) * SR): int(at(b, st) * SR) + int(0.16 * SR)], np.linspace(0.25, 1, int(0.16 * SR))[: len(SIDE[int(at(b, st) * SR): int(at(b, st) * SR) + int(0.16 * SR)])])
    for st in CL: put(lp(clap(), 3500), at(b, st), 0.5, 0.05, 0.25, duck=False)
    for st in SN: put(snare(), at(b, st), 0.4, -0.05, 0.3, duck=False)
    for st in HAT: put(hat(), at(b, st), 0.05 * (1.0 if st % 4 == 2 else 0.7), 0.3, 0, duck=False)
    for st in OH: put(hat(True), at(b, st), 0.045, -0.3, 0.1, duck=False)
    # snare rolls: end of every 4th bar in dense sections, and the run into the drop
    if s in ('dense', 'drop2') and b % 4 == 3:
        for k in range(8, 16): put(snare(0.3 + 0.7 * (k - 8) / 8), at(b, k), 0.32, 0, 0.2, duck=False)
    if b == 25:
        for k in range(8, 16): put(snare(0.3 + 0.4 * (k - 8) / 8), at(b, k), 0.32, 0, 0.2, duck=False)
    if b == 26:  # 32nds rising into the drop, stopping half a beat short
        for k in range(0, 28): put(snare(0.4 + 0.6 * k / 28), at(b, k / 2), 0.34, 0, 0.2, duck=False)
    # 808 sub
    if s in ('build',) and b >= 6:
        for q in range(4): put(sub808(ROOTS[c], BEAT * 0.9), at(b, q * 4), 0.75, 0, 0, duck=False)
    if s in ('drop', 'dense', 'drop2'):
        pat = [(0, 6), (7, 3), (10, 6)] if s == 'drop' else [(0, 3), (4, 3), (8, 3), (12, 4)]
        for st, ln in pat:
            put(sub808(ROOTS[c], ln * STEP * 1.05, glide=ROOTS[(c - 1) % 4] if st == 0 else None), at(b, st), 1.05, 0, 0, duck=False)
    if s == 'impact':
        put(sub808(ROOTS[c], BAR * 0.95), T, 0.62, 0, 0, duck=False)

# ---- structural hits ----
put(reverse_swell(BAR * 0.95, 0.5), at(3) + BAR * 0.05, 1, 0, 0.3, duck=False)
put(glitch(0.6), at(4) - 0.02, 1, 0, 0.2, duck=False); put(impact(0.7), at(4), 1, 0, 0.4, duck=False)
put(noise_sweep(BAR * 2, 300, 12000, 0.35), at(7), 1, 0, 0.4, duck=False)
put(impact(1.0), at(9), 1, 0, 0.6, duck=False); put(bell(1174.66, 2.5, 0.25), at(9), 1, 0, 0.8, duck=False)
put(noise_sweep(BAR * 2, 200, 14000, 0.45), at(25), 1, 0, 0.4, duck=False)
put(impact(1.1), at(27), 1, 0, 0.6, duck=False)
put(noise_sweep(BAR * 2, 300, 9000, 0.3), at(59), 1, 0, 0.4, duck=False); put(impact(0.8), at(61), 1, 0, 0.5, duck=False)
put(noise_sweep(BAR, 9000, 300, 0.3, up=False), at(75), 1, 0, 0.4, duck=False)
put(impact(0.9), at(88), 1, 0, 0.7, duck=False); put(bell(587.33, 4, 0.3), at(88), 1, 0, 0.9, duck=False)
put(bell(880.0, 4, 0.18), at(88) + BEAT * 2, 1, 0.2, 0.9, duck=False)

# a beat of near-silence before the drop (pads and bells only)
g0, g1 = int((at(27) - BEAT * 0.5) * SR), int(at(27) * SR)
DRY[:, g0:g1] *= 0.15

# ---- reverb, sidechain, master ----
ir_t = tt(2.6); ir = rng.standard_normal((2, len(ir_t))) * np.exp(-ir_t / 0.75); ir[:, : int(0.012 * SR)] = 0
wet = np.stack([fftconvolve(hp(SEND[i], 200), ir[i])[:N] for i in range(2)]) * 0.18
mix = DRY + DUCKED * SIDE + wet * SIDE
# section loudness ramp toward the reference's (quiet open, loud drop)
gain = np.ones(N)
def ramp(b0, b1, g): gain[int(at(b0) * SR): int(at(b1) * SR)] = g
ramp(0, 4, 0.55); ramp(4, 9, 0.85); ramp(9, 27, 0.8); ramp(88, BARS + 2, 0.8)
mix *= gain
fade = int(2.2 * SR); mix[:, -fade:] *= np.linspace(1, 0, fade)
mix = lp(mix, 9000, 2)
mix /= np.abs(mix).max()
mix = np.tanh(2.2 * mix) / np.tanh(2.2)  # glue: the reference is mastered hot
mix /= np.abs(mix).max() / 0.89
os.makedirs(sys.argv[1], exist_ok=True)
def wav(path, x):
    x = np.clip(x, -1, 1); y = (x.T * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())
wav(os.path.join(sys.argv[1], 'bed.wav'), mix)

# ---- UI sound effects for the edit ----
def mono2(x): return np.stack([x, x])
t = tt(0.12); wav(os.path.join(sys.argv[1], 'pinch.wav'), mono2(0.5 * (np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.012) + 0.4 * hp(rng.standard_normal(len(t)), 5000) * np.exp(-t / 0.004))))
t = tt(0.06); wav(os.path.join(sys.argv[1], 'click.wav'), mono2(0.6 * hp(rng.standard_normal(len(t)), 2500) * np.exp(-t / 0.006)))
wav(os.path.join(sys.argv[1], 'whoosh.wav'), mono2(noise_sweep(0.55, 400, 6000, 0.6) * np.hanning(int(0.55 * SR))))
b2 = bell(1174.66, 1.8, 0.5) + bell(1760.0, 1.8, 0.25); wav(os.path.join(sys.argv[1], 'bloom.wav'), mono2(b2))
wav(os.path.join(sys.argv[1], 'glitch.wav'), mono2(glitch(0.7)))
t = tt(0.03); wav(os.path.join(sys.argv[1], 'type.wav'), mono2(0.35 * bp(rng.standard_normal(len(t)), 1500, 6000) * np.exp(-t / 0.005)))
print('bed', round(N / SR, 1), 's; bar', round(BAR, 4), 's')
