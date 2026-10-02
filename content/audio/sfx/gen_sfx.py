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

# ==================== PACK 3 ====================
# New helper functions for pack 3 synthesis.

def sweep_sig(n, f0, f1, shape="sine", curve="exp"):
    """Frequency sweep f0 -> f1 over n samples."""
    t = np.arange(n) / SR
    dur = n / SR
    if curve == "exp":
        f = f0 * (f1 / f0) ** (t / dur)
    else:
        f = f0 + (f1 - f0) * t / dur
    phase = 2 * np.pi * np.cumsum(f) / SR
    if shape == "saw":
        return 2 * (phase / (2 * np.pi) % 1) - 1
    if shape == "square":
        return np.sign(np.sin(phase))
    return np.sin(phase)

def echo_sig(x, delay, decay, repeats=3):
    d = int(delay * SR)
    out = x.astype(float).copy()
    for r in range(1, repeats + 1):
        s = d * r
        if s < len(out):
            out[s:] += x[:len(out) - s] * (decay ** r)
    return out

def make_loop(x, fade=0.5):
    """Crossfade the tail into the head so the file loops seamlessly."""
    x = np.asarray(x, dtype=float)
    f = min(int(fade * SR), len(x) // 2)
    out = x.copy()
    out[-f:] = out[-f:] * np.linspace(1, 0, f) + out[:f] * np.linspace(0, 1, f)
    return out

def sweep_band(noise, f0, f1, chunk=512):
    """Bandpass noise with the band center sweeping f0 -> f1."""
    n = len(noise)
    out = np.zeros(n)
    for i in range(0, n, chunk):
        j = min(i + chunk, n)
        frac = i / n
        c = f0 * (1 - frac) + f1 * frac
        out[i:j] = bandpass(noise[i:j], c * 0.7, c * 1.4)
    return out

def drum_hit(n, body_freq, decay, seed, noise_lp=2000, noise_gain=0.5):
    rng = np.random.default_rng(seed)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * body_freq * t) * env_exp(n, decay)
    hit = lowpass(rng.standard_normal(n) * env_exp(n, 0.012), noise_lp)
    return body + hit * noise_gain

def piano_note(freq, dur):
    n = secs(dur)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for mult, amp, tau in [(1.0, 1.0, 0.55), (2.0, 0.32, 0.35),
                           (3.01, 0.14, 0.25), (4.02, 0.06, 0.18)]:
        y += amp * np.sin(2 * np.pi * freq * mult * t) * env_exp(n, tau)
    return y * env_ad(n, 0.004, 0.45)

def brass_note(freq, dur):
    n = secs(dur)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t)
    phase = 2 * np.pi * freq * np.cumsum(vib) / SR
    y = sum(np.sin(k * phase) / k for k in range(1, 7)) / 2.0
    return lowpass(y, 2800) * env_ad(n, 0.06, 0.4)

def blip(freq, dur, gain=0.8):
    n = secs(dur)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * t) * env_ad(n, 0.005, dur / 2) * gain

# ---------- pack 3: weapons T3/T4 ----------
S["sniper-rifle-shot"] = echo_sig(gunshot(1.6, 0.09, 65, 0.7, 7500, 20),
                                  0.30, 0.35, 3) * 0.9

rng = np.random.default_rng(121)
n = secs(0.75)
burst = np.zeros(n)
for i in range(4):
    s = int(i * 0.095 * SR)
    shot = gunshot(0.35, 0.03, 120, 0.4, 9000, 121 + i)
    burst[s:s + len(shot)] += shot * (1 - 0.10 * i)
S["smg-burst"] = burst

rng = np.random.default_rng(122)
n = secs(0.45)
t = np.arange(n) / SR
S["grenade-launcher-thump"] = (np.sin(2 * np.pi * 130 * t) * env_exp(n, 0.045) * 1.2
    + lowpass(rng.standard_normal(n) * env_exp(n, 0.025), 800) * 0.6)

rng = np.random.default_rng(123)
n = secs(1.8)
t = np.arange(n) / SR
whoosh = sweep_band(rng.standard_normal(n) * env_ad(n, 0.5, 0.35), 400, 3200)
rumble = np.sin(2 * np.pi * 55 * t) * env_ad(n, 0.4, 0.4) * 0.5
S["antitank-missile-launch"] = whoosh + rumble

n = secs(1.8)
t = np.arange(n) / SR
S["tank-cannon-near"] = (gunshot(1.8, 0.18, 38, 1.5, 2600, 24)
    + np.sin(2 * np.pi * 30 * t) * env_exp(n, 0.3) * 1.2)

S["shotgun-pump"] = (click_at(0.55, 0.10, 25, freq=1700)
    + click_at(0.55, 0.35, 26, freq=1300))

S["pistol-suppressed"] = gunshot(0.28, 0.018, 150, 0.5, 1800, 27)

rng = np.random.default_rng(128)
n = secs(0.22)
t = np.arange(n) / SR
S["knife-stab"] = (bandpass(rng.standard_normal(n) * env_exp(n, 0.015), 2800, 7000)
    + np.sin(2 * np.pi * 90 * t) * env_exp(n, 0.05) * 0.7)

# ---------- pack 3: battle layers ----------
rng = np.random.default_rng(129)
n = secs(0.35)
t = np.arange(n) / SR
S["bullet-crack-overhead"] = (highpass(rng.standard_normal(n) * env_exp(n, 0.006), 3000) * 1.3
    + sweep_sig(n, 2500, 700) * env_exp(n, 0.08) * 0.25)

n = secs(0.7)
t = np.arange(n) / SR
tick = bandpass(np.random.default_rng(130).standard_normal(secs(0.02)) * env_exp(secs(0.02), 0.004), 3000, 8000)
whine = sweep_sig(n, 4200, 1500) * (0.65 + 0.35 * np.sin(2 * np.pi * 32 * t))
S["ricochet-whine"] = np.concatenate([tick, np.zeros(n - len(tick))]) + whine * env_ad(n, 0.008, 0.18) * 0.8

rng = np.random.default_rng(131)
n = secs(0.35)
t = np.arange(n) / SR
S["dirt-impact-thud"] = (lowpass(rng.standard_normal(n) * env_exp(n, 0.025), 500)
    + np.sin(2 * np.pi * 58 * t) * env_exp(n, 0.06) * 1.2)

rng = np.random.default_rng(132)
n = secs(4.0)
bed = lowpass(brown_noise(n, rng), 300) * 0.35
sup = bed.copy()
for _ in range(14):
    at = int(rng.uniform(0, 4.0) * SR)
    cn = secs(0.12)
    crack = highpass(rng.standard_normal(cn) * env_exp(cn, 0.006), 2500)
    j = min(at + cn, n)
    sup[at:j] += crack[:j - at] * rng.uniform(0.5, 1.0)
S["suppression-loop"] = make_loop(sup, 0.5)

rng = np.random.default_rng(133)
n = secs(8.0)
bed = lowpass(brown_noise(n, rng), 120) * 0.5
db = bed.copy()
for _ in range(7):
    at = int(rng.uniform(0, 8.0) * SR)
    bn = secs(1.5)
    tb = np.arange(bn) / SR
    boom = (lowpass(rng.standard_normal(bn) * env_ad(bn, 0.1, 0.4), 150)
            + np.sin(2 * np.pi * 40 * tb) * env_ad(bn, 0.12, 0.45) * 0.8)
    j = min(at + bn, n)
    db[at:j] += boom[:j - at] * rng.uniform(0.4, 0.9)
S["distant-battle-loop"] = make_loop(db, 1.0)

# ---------- pack 3: siege ----------
n = secs(1.2)
beep = np.zeros(n)
for at in (0.0, 0.25, 0.5, 0.95):
    bn = secs(0.09)
    b = np.sin(2 * np.pi * 2400 * np.arange(bn) / SR) * env_ad(bn, 0.005, 0.03)
    s = int(at * SR)
    beep[s:s + bn] += b
S["breaching-charge-beep"] = beep

rng = np.random.default_rng(135)
n = secs(1.3)
t = np.arange(n) / SR
boom = gunshot(1.3, 0.22, 45, 1.3, 1600, 35)
crackle = (rng.random(n) > 0.985).astype(float) * rng.standard_normal(n)
wood = bandpass(crackle, 900, 2600) * env_exp(n, 0.10) * 1.5
S["door-breach-blast"] = boom + wood

n = secs(1.4)
t = np.arange(n) / SR
creak_n = secs(0.6)
creak = lowpass(sweep_sig(creak_n, 280, 110, "saw"), 600)
creak *= (0.7 + 0.3 * np.sin(2 * np.pi * 9 * t[:creak_n])) * env_ad(creak_n, 0.1, 0.2) * 0.5
thump = drum_hit(secs(0.5), 75, 0.10, 136, noise_lp=900) * 0.9
rng = np.random.default_rng(137)
wn = secs(0.5)
whoosh = sweep_band(rng.standard_normal(wn) * env_ad(wn, 0.05, 0.12), 500, 2500)
cat = np.zeros(n)
cat[:creak_n] += creak
s = int(0.62 * SR)
cat[s:s + len(thump)] += thump
s = int(0.70 * SR)
cat[s:s + wn] += whoosh * 0.7
S["catapult-release"] = cat

rng = np.random.default_rng(138)
n = secs(4.0)
roll = lowpass(brown_noise(n, rng), 250) * 0.25
for i, at in enumerate((0.0, 0.8, 1.6, 2.4, 3.2)):
    th = drum_hit(secs(0.45), 70, 0.12, 138 + i, noise_lp=800) * 0.9
    s = int(at * SR)
    roll[s:s + len(th)] += th
S["ram-rolling-loop"] = make_loop(roll, 0.4)

# ---------- pack 3: weather ----------
rng = np.random.default_rng(139)
n = secs(3.5)
t = np.arange(n) / SR
crack = highpass(rng.standard_normal(n) * env_ad(n, 0.008, 0.12), 1200) * 1.1
rum = lowpass(brown_noise(n, rng) * env_ad(n, 0.25, 1.1), 220)
thunder = crack + rum
thunder += echo_sig(thunder, 0.32, 0.4, 1) * 0.6
S["thunder-near"] = thunder

rng = np.random.default_rng(140)
n = secs(5.0)
t = np.arange(n) / SR
r = lowpass(brown_noise(n, rng), 150) * env_ad(n, 0.7, 1.6)
S["thunder-distant"] = r * (0.7 + 0.3 * np.sin(2 * np.pi * 0.4 * t))

rng = np.random.default_rng(141)
raw_n = secs(7.0)
t = np.arange(raw_n) / SR
w = lowpass(brown_noise(raw_n, rng), 600)
howl = bandpass(brown_noise(raw_n, rng), 350, 900)
am = (0.5 + 0.5 * np.sin(2 * np.pi * 0.35 * t + 1) ** 2) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.13 * t))
wind = w * 0.7 + howl * am * 0.8
S["wind-howl-loop"] = make_loop(wind[:secs(6.0)], 1.0)

# ---------- pack 3: animals ----------
n = secs(1.3)
t = np.arange(n) / SR
freq = 600 - 280 * (t / 1.3) + 25 * np.sin(2 * np.pi * 6 * t)
phase = 2 * np.pi * np.cumsum(freq) / SR
wh = sum(np.sin(k * phase) / k for k in range(1, 6)) / 2.2
am = 0.65 + 0.35 * np.sin(2 * np.pi * 13 * t) ** 2
S["horse-whinny"] = lowpass(wh, 2500) * env_ad(n, 0.12, 0.35) * am

rng = np.random.default_rng(143)
n = secs(0.55)
bark = np.zeros(n)
for at in (0.0, 0.30):
    bn = secs(0.16)
    bt = np.arange(bn) / SR
    b = (sweep_sig(bn, 200, 140, "saw") * env_ad(bn, 0.008, 0.05)
         + bandpass(rng.standard_normal(bn), 400, 1800) * env_ad(bn, 0.008, 0.05) * 0.6)
    s = int(at * SR)
    bark[s:s + bn] += b
S["dog-bark"] = bark

rng = np.random.default_rng(144)
n = secs(0.70)
caw = np.zeros(n)
for at in (0.0, 0.34):
    cn = secs(0.30)
    ct = np.arange(cn) / SR
    c = sweep_sig(cn, 950, 480, "saw") * (0.6 + 0.4 * np.sin(2 * np.pi * 28 * ct))
    s = int(at * SR)
    caw[s:s + cn] += lowpass(c, 2200) * env_ad(cn, 0.015, 0.10)
S["crow-caw"] = caw

# ---------- pack 3: tavern ----------
n = secs(0.35)
t = np.arange(n) / SR
clink = sum(np.sin(2 * np.pi * f * t) * env_exp(n, tau)
            for f, tau in [(810, 0.09), (2130, 0.06), (3420, 0.04)]) / 3
tick = bandpass(np.random.default_rng(145).standard_normal(n) * env_exp(n, 0.004), 4000, 9000) * 0.3
S["mug-clink"] = clink + tick

rng = np.random.default_rng(146)
n = secs(0.9)
dice = np.zeros(n)
ats = sorted(rng.uniform(0.05, 0.8, 9))
for at in ats:
    cn = secs(0.06)
    ct = np.arange(cn) / SR
    k = (np.sin(2 * np.pi * (700 + rng.uniform(0, 600)) * ct) * env_exp(cn, 0.008)
         + rng.standard_normal(cn) * env_exp(cn, 0.004) * 0.4)
    s = int(at * SR)
    dice[s:s + cn] += k
S["dice-roll"] = dice

rng = np.random.default_rng(147)
n = secs(1.6)
laugh = np.zeros(n)
for i in range(8):
    hn = secs(0.14)
    f = 250 - 10 * i
    ha = sweep_sig(hn, f * 1.3, f * 0.8, "saw")
    s = int(i * 0.19 * SR)
    laugh[s:s + hn] += bandpass(ha, 500, 2600) * env_ad(hn, 0.015, 0.08) * 0.9
S["tavern-laughter"] = laugh

# bar-piano-loop: original 8s loop, C-G-Am-F arpeggios (own composition)
n = secs(8.0)
piano = np.zeros(n)
chords = [
    (130.81, [261.63, 329.63, 392.00]),   # C
    (98.00, [246.94, 293.66, 392.00]),    # G
    (110.00, [261.63, 329.63, 440.00]),   # Am
    (87.31, [220.00, 261.63, 349.23]),    # F
]
for ci, (bass, tones) in enumerate(chords):
    base = ci * 2.0
    bn = piano_note(bass, 1.9) * 0.8
    s = int(base * SR)
    piano[s:s + len(bn)] += bn
    for j in range(8):
        note = piano_note(tones[[0, 1, 2, 1, 0, 1, 2, 1][j]], 0.30) * 0.6
        s = int((base + j * 0.25) * SR)
        j2 = min(s + len(note), len(piano))
        piano[s:j2] += note[:j2 - s]
S["bar-piano-loop"] = make_loop(lowpass(piano, 7000), 0.3)

# ---------- pack 3: campaign ----------
rng = np.random.default_rng(148)
n = secs(4.0)
t = np.arange(n) / SR
eng = lowpass(brown_noise(n, rng), 90) * 0.7
hum = np.sin(2 * np.pi * 55 * t) * (0.75 + 0.25 * np.sin(2 * np.pi * 9 * t)) * 0.4
rumble = bandpass(brown_noise(n, rng), 200, 600) * 0.15
S["convoy-rumble-loop"] = make_loop(eng + hum + rumble, 0.5)

rng = np.random.default_rng(149)
n = secs(4.0)
train = lowpass(brown_noise(n, rng), 150) * 0.3
train += bandpass(rng.standard_normal(n), 3000, 8000) * 0.08
for i in range(14):
    at = i * 0.27
    cn = secs(0.10)
    chuff = bandpass(rng.standard_normal(cn) * env_ad(cn, 0.005, 0.03), 500, 1800) * 0.6
    s = int(at * SR)
    train[s:s + cn] += chuff
wn = secs(0.8)
wt = np.arange(wn) / SR
whistle = (np.sin(2 * np.pi * 660 * wt) + np.sin(2 * np.pi * 830 * wt)) * env_ad(wn, 0.1, 0.5) * 0.2
train[0:wn] += whistle
S["train-pass"] = train

rng = np.random.default_rng(150)
n = secs(5.0)
t = np.arange(n) / SR
env = np.sin(np.pi * t / 5.0) ** 2
f_inst = 95 - 25 * (t / 5.0)
phase = 2 * np.pi * np.cumsum(f_inst) / SR
drone = np.sin(phase) + 0.5 * np.sin(2 * phase)
noise = bandpass(brown_noise(n, rng), 300, 900) * 0.3
S["airplane-flyover"] = (drone * 0.5 + noise) * env

rng = np.random.default_rng(151)
n = secs(4.0)
chatter = np.zeros(n)
pos = 0
while pos < n:
    d = rng.uniform(0.07, 0.16)
    sn = secs(d)
    if pos + sn > n:
        break
    syl = bandpass(rng.standard_normal(sn) * env_ad(sn, 0.008, 0.03),
                   rng.uniform(700, 1400), rng.uniform(2200, 3200))
    chatter[pos:pos + sn] += syl * 0.8
    pos += sn + int(rng.uniform(0.02, 0.12) * SR)
chatter = bandpass(chatter, 300, 3400)
chatter = np.tanh(chatter * 1.5) * 0.8
S["radio-chatter-loop"] = make_loop(chatter, 0.4)

rng = np.random.default_rng(152)
n = secs(2.0)
t = np.arange(n) / SR
am = (0.55 + 0.45 * np.sin(2 * np.pi * 13 * t)) ** 1.5
body = lowpass(rng.standard_normal(n), 350) * 0.5 + np.sin(2 * np.pi * 26 * t) * 0.3
S["helicopter-rotor-loop"] = make_loop(body * am, 0.2)

# ---------- pack 3: UI ----------
n = secs(0.25)
confirm = np.zeros(n)
b = blip(1200, 0.06); confirm[0:len(b)] += b
b = blip(1800, 0.08); s = int(0.09 * SR); confirm[s:s + len(b)] += b
S["ui-confirm"] = confirm

n = secs(0.25)
cancel = np.zeros(n)
b = blip(900, 0.06); cancel[0:len(b)] += b
b = blip(600, 0.08); s = int(0.09 * SR); cancel[s:s + len(b)] += b
S["ui-cancel"] = cancel

n = secs(0.35)
err = np.zeros(n)
for at in (0.0, 0.16):
    bn = secs(0.12)
    buzz = sweep_sig(bn, 170, 170, "saw") * env_ad(bn, 0.01, 0.05)
    s = int(at * SR)
    err[s:s + bn] += buzz
S["ui-error"] = lowpass(err, 1200)

rng = np.random.default_rng(156)
n = secs(0.10)
t = np.arange(n) / SR
S["ui-select"] = (np.sin(2 * np.pi * 1600 * t) * env_exp(n, 0.012) * 0.7
    + highpass(rng.standard_normal(n) * env_exp(n, 0.004), 4000) * 0.3)

n = secs(0.7)
t = np.arange(n) / SR
S["notification-ping"] = ((np.sin(2 * np.pi * 1250 * t) + 0.5 * np.sin(2 * np.pi * 1875 * t))
    * env_exp(n, 0.25) * 0.6)

n = secs(1.5)
chime = np.zeros(n)
for i, f in enumerate((523.25, 659.25, 783.99, 1046.50)):
    bn = secs(0.7)
    bt = np.arange(bn) / SR
    note = (np.sin(2 * np.pi * f * bt) + 0.4 * np.sin(2 * np.pi * 2 * f * bt)) * env_exp(bn, 0.35)
    s = int(i * 0.22 * SR)
    chime[s:s + bn] += note * 0.6
S["quest-complete-chime"] = chime

n = secs(2.25)
fan = np.zeros(n)
chords = [
    (0.0, (261.63, 329.63, 392.00), 0.45),   # C
    (0.45, (349.23, 440.00, 523.25), 0.45),  # F
    (0.90, (392.00, 493.88, 587.33), 0.45),  # G
    (1.35, (261.63, 329.63, 392.00, 523.25), 0.90),  # C hold
]
for at, freqs, dur in chords:
    for f in freqs:
        note = brass_note(f, dur) * 0.5
        s = int(at * SR)
        fan[s:s + len(note)] += note
S["levelup-fanfare"] = fan

# ---------- pack 3: music ----------
n = secs(2.0)
dl = np.zeros(n)
for i, at in enumerate((0.0, 0.5, 1.0, 1.25, 1.5)):
    th = drum_hit(secs(0.5), 65, 0.14, 160 + i, noise_lp=900, noise_gain=0.4)
    s = int(at * SR)
    dl[s:s + len(th)] += th
S["battle-drums-low-loop"] = make_loop(dl, 0.15)

n = secs(2.0)
dh = np.zeros(n)
for j in range(8):
    th = drum_hit(secs(0.25), 190, 0.06, 170 + j, noise_lp=6000, noise_gain=0.9) * 0.7
    s = int(j * 0.25 * SR)
    dh[s:s + len(th)] += th
S["battle-drums-high-loop"] = make_loop(dh, 0.15)

n = secs(8.0)
t = np.arange(n) / SR
pad = np.zeros(n)
for i, f in enumerate((110.0, 164.81, 220.0, 261.63, 329.63)):
    pad += np.sin(2 * np.pi * f * t + i * 0.7) / len((110.0, 164.81, 220.0, 261.63, 329.63))
lfo = 0.85 + 0.15 * np.sin(2 * np.pi * 0.125 * t)
S["campaign-pad-loop"] = make_loop(pad * lfo * 0.5, 0.5)

# radio-music-loop: original 8s lo-fi tune (own composition)
rng = np.random.default_rng(173)
n = secs(8.0)
tune = np.zeros(n)
melody = (261.63, 293.66, 329.63, 392.00, 440.00, 392.00, 329.63, 293.66,
          261.63, 293.66, 329.63, 392.00, 440.00, 392.00, 293.66, 261.63)
for i, f in enumerate(melody):
    note = piano_note(f, 0.50) * 0.8
    s = int(i * 0.5 * SR)
    tune[s:s + len(note)] += note
for i, f in enumerate((130.81, 130.81, 98.00, 98.00, 130.81, 130.81, 98.00, 130.81)):
    note = piano_note(f, 0.90) * 0.6
    s = int(i * 1.0 * SR)
    tune[s:s + len(note)] += note
tune = bandpass(tune, 400, 3200)
vinyl = ((rng.random(n) > 0.998).astype(float) * rng.standard_normal(n)) * 0.05
S["radio-music-loop"] = make_loop(tune + vinyl, 0.3)

# ---------- pack 3: misc ----------
rng = np.random.default_rng(174)
n = secs(0.30)
t = np.arange(n) / SR
S["footstep-mud"] = (lowpass(rng.standard_normal(n) * env_exp(n, 0.07), 600)
    + sweep_sig(n, 280, 110) * env_exp(n, 0.09) * 0.6)

rng = np.random.default_rng(175)
n = secs(0.20)
t = np.arange(n) / SR
ring = sum(np.sin(2 * np.pi * f * t) * env_exp(n, 0.035)
           for f in (618, 1236, 1854)) / 3
S["footstep-metal"] = ring + highpass(rng.standard_normal(n) * env_exp(n, 0.006), 3500) * 0.5

n = secs(1.0)
t = np.arange(n) / SR
dopen = np.zeros(n)
creak_n = secs(0.6)
creak = lowpass(sweep_sig(creak_n, 180, 90, "saw"), 700)
creak *= (0.7 + 0.3 * np.sin(2 * np.pi * 7 * t[:creak_n])) * env_ad(creak_n, 0.15, 0.3) * 0.5
dopen[:creak_n] += creak
dopen += click_at(1.0, 0.60, 176, freq=2200)
tn = secs(0.25)
tt = np.arange(tn) / SR
thud = np.sin(2 * np.pi * 70 * tt) * env_exp(tn, 0.08) * 0.6
s = int(0.75 * SR)
dopen[s:s + tn] += thud
S["door-open"] = dopen

rng = np.random.default_rng(177)
n = secs(0.6)
t = np.arange(n) / SR
dclose = (lowpass(rng.standard_normal(n) * env_exp(n, 0.05), 700)
    + np.sin(2 * np.pi * 85 * t) * env_exp(n, 0.09))
for i, at in enumerate((0.20, 0.28, 0.36)):
    kn = secs(0.05)
    kt = np.arange(kn) / SR
    k = np.sin(2 * np.pi * 300 * kt) * env_exp(kn, 0.012) * 0.4
    s = int(at * SR)
    dclose[s:s + kn] += k
S["door-close"] = dclose

rng = np.random.default_rng(178)
n = secs(0.7)
t = np.arange(n) / SR
cslam = (lowpass(rng.standard_normal(n) * env_exp(n, 0.035), 500) * 1.3
    + np.sin(2 * np.pi * 62 * t) * env_exp(n, 0.07))
for at in (0.14, 0.21):
    rn = secs(0.04)
    r = bandpass(rng.standard_normal(rn) * env_exp(rn, 0.010), 2500, 5000) * 0.4
    s = int(at * SR)
    cslam[s:s + rn] += r
S["car-door-slam"] = cslam

rng = np.random.default_rng(179)
n = secs(2.5)
est = np.zeros(n)
for i in range(6):
    cn = secs(0.16)
    pulse = sweep_sig(cn, 60, 35, "saw") * env_exp(cn, 0.05)
    s = int(i * 0.19 * SR)
    est[s:s + cn] += pulse * 0.7
in2 = secs(1.3)
t2 = np.arange(in2) / SR
idle = (np.sin(2 * np.pi * 45 * t2) + 0.5 * np.sin(2 * np.pi * 90 * t2)
        + 0.25 * np.sin(2 * np.pi * 135 * t2))
idle = lowpass(idle, 500) * (0.8 + 0.2 * np.sin(2 * np.pi * 7 * t2))
s = int(1.15 * SR)
est[s:s + in2] += idle * env_ad(in2, 0.15, 0.8) * 0.7
S["engine-start"] = est

n = secs(4.0)
t = np.arange(n) / SR
phase = 2 * np.pi * np.cumsum(800 + 350 * np.sin(2 * np.pi * 0.5 * t)) / SR
siren = np.sin(phase) + 0.3 * np.sin(2 * phase)
S["air-raid-siren"] = siren * env_ad(n, 0.3, 99) * 0.5

rng = np.random.default_rng(181)
n = secs(0.3)
jam = np.zeros(n)
cn = secs(0.05)
jam[0:cn] += bandpass(rng.standard_normal(cn) * env_exp(cn, 0.008), 800, 2500)
gn = secs(0.15)
gt = np.arange(gn) / SR
grind = (bandpass(rng.standard_normal(gn), 1500, 3000)
         * (0.5 + 0.5 * np.sin(2 * np.pi * 45 * gt)) * env_ad(gn, 0.01, 0.06) * 0.5)
s = int(0.10 * SR)
jam[s:s + gn] += grind
S["gun-jam-click"] = jam

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
