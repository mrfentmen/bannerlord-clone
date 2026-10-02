#!/usr/bin/env python3
"""Procedural SFX synthesizer for the Bannerlord-style game.
All sounds generated with numpy: noise bursts, envelopes, simple filters,
sine sweeps. Output: 44.1kHz 16-bit mono WAV, all under 2MB.
"""
import numpy as np
import os, wave, struct

SR = 44100
OUT = os.path.expanduser("~/workspace/bannerlord/content/audio/sfx")
os.makedirs(OUT, exist_ok=True)

def env_exp(n, tau):
    t = np.arange(n) / SR
    return np.exp(-t / tau)

def env_ad(n, a, d):
    """attack-decay envelope"""
    t = np.arange(n) / SR
    e = np.ones(n)
    na = int(a * SR)
    e[:na] = np.linspace(0, 1, na)
    e[na:] = np.exp(-(t[na:] - a) / d)
    return e

def lowpass(x, cutoff):
    alpha = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += alpha * (x[i] - acc)
        y[i] = acc
    return y

def highpass(x, cutoff):
    alpha = np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x)
    acc = x[0]
    for i in range(len(x)):
        acc = alpha * (acc + x[i] - (x[i-1] if i else 0))
        y[i] = x[i] - acc
    return y

def bandpass(x, lo, hi):
    return highpass(lowpass(x, hi), lo)

def brown_noise(n, rng):
    w = rng.standard_normal(n)
    b = np.cumsum(w)
    b -= np.linspace(b[0], b[-1], n)
    return b / (np.abs(b).max() + 1e-9)

def write(name, x):
    x = np.nan_to_num(x)
    peak = np.abs(x).max()
    if peak > 0:
        x = x / peak * 0.9
    data = (x * 32767).astype(np.int16)
    path = os.path.join(OUT, name)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    return path

def secs(s):
    return int(s * SR)

def gunshot(dur, decay, thump_freq, thump_gain, lp, seed):
    rng = np.random.default_rng(seed)
    n = secs(dur)
    noise = rng.standard_normal(n) * env_exp(n, decay)
    noise = lowpass(noise, lp)
    t = np.arange(n) / SR
    thump = np.sin(2 * np.pi * thump_freq * t) * env_exp(n, decay * 0.6) * thump_gain
    return noise + thump

def click_at(total, at, seed, freq=3200, q_lp=8000):
    rng = np.random.default_rng(seed)
    n = secs(total)
    out = np.zeros(n)
    cn = secs(0.06)
    c = rng.standard_normal(cn) * env_exp(cn, 0.008)
    c = bandpass(c, freq / 2, q_lp)
    s = int(at * SR)
    out[s:s + cn] += c * 0.9
    return out

# ---------- definitions ----------
S = {}
S["rifle-shot"] = gunshot(0.5, 0.06, 70, 0.8, 6000, 1)
S["pistol-shot"] = gunshot(0.35, 0.035, 110, 0.5, 9000, 2)
S["shotgun-blast"] = gunshot(0.8, 0.12, 50, 1.2, 3500, 3)

rng = np.random.default_rng(4)
n = secs(2.5)
boom = rng.standard_normal(n) * env_ad(n, 0.005, 0.5)
boom = lowpass(boom, 400)
t = np.arange(n) / SR
boom += np.sin(2 * np.pi * 45 * t) * env_exp(n, 0.4) * 1.5
S["explosion-near"] = boom

rng = np.random.default_rng(5)
n = secs(3.0)
far = rng.standard_normal(n) * env_ad(n, 0.15, 0.8)
far = lowpass(far, 180)
t = np.arange(n) / SR
far += np.sin(2 * np.pi * 35 * t) * env_ad(n, 0.2, 0.9)
S["explosion-far"] = far * 0.8

S["reload"] = click_at(0.65, 0.12, 6) + click_at(0.65, 0.42, 7, freq=2400)

rng = np.random.default_rng(8)
n = secs(0.18)
g = rng.standard_normal(n) * env_exp(n, 0.05)
S["footstep-grass"] = lowpass(g, 1200) * 0.7

rng = np.random.default_rng(9)
n = secs(0.18)
gv = rng.standard_normal(n) * env_exp(n, 0.04)
crackle = (rng.random(n) > 0.97).astype(float) * rng.standard_normal(n)
S["footstep-gravel"] = (bandpass(gv, 2000, 8000) + crackle * 0.5) * 0.7

rng = np.random.default_rng(10)
n = secs(0.22)
t = np.arange(n) / SR
knock = np.sin(2 * np.pi * 160 * t) * env_exp(n, 0.05)
tap = rng.standard_normal(n) * env_exp(n, 0.015)
S["footstep-wood"] = (knock * 0.8 + lowpass(tap, 2500) * 0.5)

n = secs(0.08)
t = np.arange(n) / SR
S["ui-click"] = np.sin(2 * np.pi * 2000 * t) * env_exp(n, 0.015)

n = secs(0.14)
t = np.arange(n) / SR
S["ui-hover"] = np.sin(2 * np.pi * 1200 * t) * env_ad(n, 0.02, 0.05) * 0.6

rng = np.random.default_rng(11)
n = secs(0.7)
t = np.arange(n) / SR
partials = [523 * 1.0, 523 * 2.76, 523 * 5.40, 523 * 8.93]
ring = sum(np.sin(2 * np.pi * f * t) * env_exp(n, 0.15 + 0.05 * i)
           for i, f in enumerate(partials)) / len(partials)
clang = rng.standard_normal(n) * env_exp(n, 0.03)
S["sword-clash"] = ring * 0.8 + bandpass(clang, 3000, 9000) * 0.4

rng = np.random.default_rng(12)
n = secs(0.5)
noise = rng.standard_normal(n)
out = np.zeros(n)
# sweeping bandpass: process in small chunks
chunk = 512
for i in range(0, n, chunk):
    j = min(i + chunk, n)
    frac = i / n
    center = 3000 * (1 - frac) + 800 * frac
    seg = noise[i:j]
    out[i:j] = bandpass(seg, center * 0.7, center * 1.4)
S["arrow-whoosh"] = out * env_ad(n, 0.08, 0.12)

n = secs(1.8)
t = np.arange(n) / SR
f0 = 98
vib = 1 + 0.004 * np.sin(2 * np.pi * 5 * t)
phase = 2 * np.pi * f0 * np.cumsum(vib) / SR
saw = 2 * (phase / (2 * np.pi) % 1) - 1
horn = sum((1 / k) * np.sin(k * phase) for k in range(1, 8)) / 3.0
S["war-horn"] = lowpass(horn, 900) * env_ad(n, 0.35, 0.5)

rng = np.random.default_rng(13)
n = secs(2.5)
cheer = np.zeros(n)
for _ in range(24):
    v = rng.standard_normal(n)
    v = bandpass(v, rng.uniform(400, 1200), rng.uniform(1500, 4000))
    v *= env_ad(n, rng.uniform(0.2, 0.5), rng.uniform(0.4, 0.9))
    cheer += v
S["crowd-cheer"] = cheer / 24 * 3.0

rng = np.random.default_rng(14)
n = secs(1.2)
gasp = np.zeros(n)
for _ in range(18):
    v = rng.standard_normal(n)
    v = bandpass(v, rng.uniform(800, 1500), rng.uniform(2000, 4500))
    gasp += v
S["crowd-gasp"] = gasp / 18 * 2.5 * env_ad(n, 0.15, 0.25)

# seamless wind loop: generate extra, crossfade tail into head
rng = np.random.default_rng(15)
raw_n = secs(6.0)
wind = brown_noise(raw_n, rng)
wind = lowpass(wind, 500)
t = np.arange(raw_n) / SR
mod = 0.6 + 0.4 * np.sin(2 * np.pi * 0.12 * t) * np.sin(2 * np.pi * 0.07 * t + 1)
wind *= mod
n = secs(5.0)
fade = secs(1.0)
loop = wind[:n].copy()
loop[-fade:] = loop[-fade:] * np.linspace(1, 0, fade) + wind[n:n + fade] * np.linspace(0, 1, fade)
S["ambient-wind-loop"] = loop

n = secs(1.5)
t = np.arange(n) / SR
bell = (np.sin(2 * np.pi * 880 * t) * env_exp(n, 0.5)
        + 0.5 * np.sin(2 * np.pi * 1318.5 * t + 0.3) * env_exp(n, 0.35))
bell += 0.4 * np.sin(2 * np.pi * 880 * (t - 0.25).clip(min=0)) * env_exp(n, 0.4) * (t > 0.25)
S["heal-chime"] = bell * 0.7

# ---------- write + verify ----------
print(f"{'file':26s} {'dur(s)':>7s} {'rms':>8s} {'size':>9s}  status")
failed = []
for name, x in S.items():
    path = write(name + ".wav", x)
    with wave.open(path, "rb") as w:
        sr = w.getframerate()
        nf = w.getnframes()
        ch = w.getnchannels()
        sw = w.getsampwidth()
    dur = nf / sr
    data = np.frombuffer(open(path, "rb").read()[44:], dtype=np.int16).astype(float) / 32768
    rms = float(np.sqrt(np.mean(data ** 2)))
    size = os.path.getsize(path)
    ok = rms > 0.001 and sr == 44100 and ch == 1 and sw == 2 and size < 2_000_000 and dur > 0.05
    print(f"{name+'.wav':26s} {dur:7.2f} {rms:8.4f} {size:9d}  {'OK' if ok else 'FAIL'}")
    if not ok:
        failed.append(name)
        os.remove(path)

print("\nFAILED:", failed if failed else "none")
print("WROTE:", len(S) - len(failed), "files to", OUT)
