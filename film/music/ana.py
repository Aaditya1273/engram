"""Measure a track the way learn.md asks: BPM (spectral flux autocorrelation), key (Krumhansl), and per bar the
loudness, brightness (centroid) and band shares (sub/low/mid/high/air). Usage: ana.py track.(mp3|wav) [bpm]"""
import subprocess, sys
import numpy as np
SR = 22050
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', sys.argv[1], '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
x = np.frombuffer(raw, np.float32)
H, W = 512, 2048
win = np.hanning(W)
frames = np.lib.stride_tricks.sliding_window_view(x, W)[::H] * win
S = np.abs(np.fft.rfft(frames, axis=1))
freqs = np.fft.rfftfreq(W, 1 / SR)
flux = np.maximum(0, np.diff(np.log1p(S), axis=0)).sum(1)
flux = (flux - flux.mean()) / (flux.std() + 1e-9)
fps = SR / H
def bpm_of(f):
    ac = np.correlate(f, f, 'full')[len(f) - 1:]
    lags = np.arange(len(ac)) / fps
    best, bb = 0, 0
    for bpm in np.arange(70, 180, 0.25):
        lag = 60 / bpm
        score = sum(ac[int(round(k * lag * fps))] for k in (1, 2, 4) if int(round(k * lag * fps)) < len(ac))
        if score > best: best, bb = score, bpm
    return bb
bpm = float(sys.argv[2]) if len(sys.argv) > 2 else bpm_of(flux[: int(60 * fps)])
beat = 60 / bpm
# Downbeat phase: the offset (within a bar) whose beat positions carry the most flux.
bar = 4 * beat
phases = np.arange(0, bar, 0.01)
def phase_score(p):
    t = np.arange(p, len(x) / SR, beat); idx = (t * fps).astype(int); idx = idx[idx < len(flux)]
    return flux[idx].mean()
off = max(np.arange(0, beat, 0.005), key=phase_score)
# Key: chroma vs Krumhansl profiles.
major = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
minor = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
m = (freqs > 60) & (freqs < 2000)
pc = (np.round(12 * np.log2(freqs[m] / 440)) % 12).astype(int)
chroma = np.zeros(12)
np.add.at(chroma, pc, S[:, m].sum(0))
chroma = np.roll(chroma, -3)  # index 0 = C
names = 'C C# D D# E F F# G G# A A# B'.split()
best = max(((np.corrcoef(np.roll(prof, k), chroma)[0, 1], names[k] + (' major' if prof is major else ' minor')) for prof in (major, minor) for k in range(12)))
print(f'duration {len(x)/SR:.1f}s  BPM {bpm:.2f}  beat {beat:.3f}s  bar {bar:.3f}s  first beat {off:.3f}s  key {best[1]} (r={best[0]:.2f})')
bands = {'sub': (20, 60), 'low': (60, 250), 'mid': (250, 2000), 'high': (2000, 8000), 'air': (8000, 11000)}
t0 = off
print(' bar  time   dB   centroid  sub  low  mid high  air   onsets/bar')
for b in range(int((len(x) / SR - t0) / bar)):
    a, z = int((t0 + b * bar) * SR), int((t0 + (b + 1) * bar) * SR)
    seg = x[a:z]
    db = 20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-9)
    fa, fz = int((t0 + b * bar) * fps), int((t0 + (b + 1) * bar) * fps)
    spec = (S[fa:fz] ** 2).sum(0)
    cen = (freqs * spec).sum() / (spec.sum() + 1e-9)
    share = {k: spec[(freqs >= lo) & (freqs < hi)].sum() / (spec.sum() + 1e-9) for k, (lo, hi) in bands.items()}
    ons = int((flux[fa:fz] > 1.5).sum())
    print(f'{b:4d} {t0 + b*bar:6.1f} {db:5.1f} {cen:8.0f}  ' + ' '.join(f'{100*v:4.0f}' for v in share.values()) + f'   {ons}')
