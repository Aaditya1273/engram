"""16-step onset grid per band over a range of bars: how often each step hits (0-9). Usage: grid.py track bpm first_beat bar_from bar_to"""
import subprocess, sys
import numpy as np
SR = 22050
path, bpm, off, b0, b1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
x = np.frombuffer(raw, np.float32)
H, W = 256, 1024
S = np.abs(np.fft.rfft(np.lib.stride_tricks.sliding_window_view(x, W)[::H] * np.hanning(W), axis=1))
f = np.fft.rfftfreq(W, 1 / SR); fps = SR / H
bar = 240 / bpm; step = bar / 16
for name, lo, hi in [('kick', 30, 110), ('snare', 150, 450), ('clap/hi', 1500, 6000), ('hat', 6000, 11000)]:
    e = np.log1p(S[:, (f >= lo) & (f < hi)].sum(1))
    fl = np.maximum(0, np.diff(e)); fl /= (np.percentile(fl, 99) + 1e-9)
    hits = np.zeros(16)
    for b in range(b0, b1):
        for s in range(16):
            t = off + b * bar + s * step
            i = int(t * fps)
            hits[s] += fl[max(0, i - 2):i + 3].max() > 0.35
    print(f'{name:8s} ' + ''.join(str(min(9, int(round(9 * h / (b1 - b0))))) for h in hits))
