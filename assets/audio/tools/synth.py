"""Procedural game-music synth engine: compose instrument stems with numpy,
layer them into mixes. No samples, no soundfonts - pure DSP synthesis.
Sample rate 44100, everything rendered to float32 buffers."""
import numpy as np
from scipy import signal as _sig

SR = 44100


# ------------------------------------------------------------------ utils
def midi_to_freq(m):
    return 440.0 * (2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0))


def secs(beats, bpm):
    return beats * 60.0 / bpm


def adsr(n, a, d, s_level, r):
    """ADSR envelope, n samples. a/d/r in seconds."""
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    env = np.zeros(n)
    # attack
    i = min(na, n)
    if i > 0:
        env[:i] = np.linspace(0, 1, i)
    # decay to sustain
    j = min(na + nd, n)
    if j > na:
        env[na:j] = np.linspace(1, s_level, j - na)
    # sustain
    k = min(na + nd + max(n - na - nd - nr, 0), n)
    env[j:k] = s_level
    # release
    if nr > 0 and k < n:
        m = n - k
        env[k:] = np.linspace(s_level, 0, m)
    return env


def _osc(freq, n, kind="sine", phase=0.0):
    t = np.arange(n) / SR + phase / (2 * np.pi * np.maximum(freq, 1e-6))
    if kind == "sine":
        return np.sin(2 * np.pi * freq * np.arange(n) / SR + phase)
    if kind == "saw":
        return _sig.sawtooth(2 * np.pi * freq * np.arange(n) / SR + phase)
    if kind == "square":
        return _sig.square(2 * np.pi * freq * np.arange(n) / SR + phase)
    if kind == "tri":
        return _sig.sawtooth(2 * np.pi * freq * np.arange(n) / SR + phase, width=0.5)
    raise ValueError(kind)


def lowpass(x, cutoff, order=2):
    b, a = _sig.butter(order, cutoff / (SR / 2), btype="low")
    return _sig.lfilter(b, a, x)


def highpass(x, cutoff, order=2):
    b, a = _sig.butter(order, cutoff / (SR / 2), btype="high")
    return _sig.lfilter(b, a, x)


_rng = np.random.default_rng(1337)


def noise(n):
    return _rng.standard_normal(n)


# ------------------------------------------------------------- percussion
def kick(dur=0.45, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 45 + 130 * np.exp(-t * 28)          # pitch drop 175 -> 45 Hz
    ph = np.cumsum(2 * np.pi * f / SR)
    body = np.sin(ph) * np.exp(-t * 9)
    click = highpass(noise(n), 4000) * np.exp(-t * 220) * 0.6
    return (body + click) * vel * 0.9


def taiko(dur=0.9, vel=1.0):
    """Deep war drum."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 60 + 90 * np.exp(-t * 14)
    ph = np.cumsum(2 * np.pi * f / SR)
    body = np.sin(ph) * np.exp(-t * 5.5)
    skin = lowpass(noise(n), 900) * np.exp(-t * 40) * 0.5
    return (body + skin) * vel


def snare(dur=0.3, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    snap = highpass(noise(n), 1800) * np.exp(-t * 28)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 32) * 0.7
    return (snap * 0.8 + body) * vel * 0.8


def tom(freq=110, dur=0.5, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = freq * 0.6 + freq * 0.9 * np.exp(-t * 18)
    ph = np.cumsum(2 * np.pi * f / SR)
    return np.sin(ph) * np.exp(-t * 8) * vel * 0.85


def hat(dur=0.06, vel=1.0, open_=False):
    n = int(dur * SR)
    t = np.arange(n) / SR
    decay = 14 if open_ else 90
    return highpass(noise(n), 7500) * np.exp(-t * decay) * vel * 0.5


def crash(dur=2.2, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = highpass(noise(n), 5000)
    return x * (np.exp(-t * 2.2) * 0.7 + np.exp(-t * 9) * 0.3) * vel * 0.55


# ------------------------------------------------------------ tonal parts
def bass_note(midi, dur, vel=1.0, cutoff=700.0):
    n = int(dur * SR)
    f = midi_to_freq(midi)
    saw = _osc(f, n, "saw") + 0.5 * _osc(f * 0.5, n, "saw")
    sub = np.sin(2 * np.pi * f * 0.5 * np.arange(n) / SR)
    x = lowpass(saw * 0.6 + sub * 0.7, cutoff)
    return x * adsr(n, 0.01, 0.08, 0.85, min(0.15, dur * 0.3)) * vel * 0.75


def pad_chord(midis, dur, vel=1.0, cutoff=2400.0, attack=0.8):
    """Detuned string-ish pad."""
    n = int(dur * SR)
    x = np.zeros(n)
    for m in midis:
        f = midi_to_freq(m)
        for det in (-4, 3):  # cents-ish detune via freq ratio
            fr = f * (2.0 ** (det / 1200.0))
            x += _osc(fr, n, "saw") * 0.33
            x += _osc(fr * 2.0, n, "sine") * 0.12
    x = lowpass(x, cutoff)
    env = adsr(n, attack, 0.6, 0.9, min(1.2, dur * 0.35))
    return x * env * vel * 0.30


def brass_note(midi, dur, vel=1.0):
    n = int(dur * SR)
    f = midi_to_freq(midi)
    x = _osc(f, n, "saw") * 0.6 + _osc(f * 2, n, "saw") * 0.25 + _osc(f * 3, n, "sine") * 0.15
    # brass: filter opens with attack
    t = np.arange(n) / SR
    cutoff_env = 800 + 3200 * np.minimum(t / 0.25, 1.0)
    # time-varying filter via simple one-pole sweep (approx with blocks)
    y = np.zeros(n)
    alpha_last, y_last = 0.0, 0.0
    for i in range(0, n, 64):
        blk = slice(i, min(i + 64, n))
        c = cutoff_env[blk].mean()
        alpha = 1 - np.exp(-2 * np.pi * c / SR)
        seg = x[blk]
        out = np.empty_like(seg)
        for j, s in enumerate(seg):
            y_last += alpha * (s - y_last)
            out[j] = y_last
        y[blk] = out
    return y * adsr(n, 0.09, 0.25, 0.8, min(0.4, dur * 0.3)) * vel * 0.5


def lead_note(midi, dur, vel=1.0, vibrato=5.5, vib_depth=6.0):
    """Heroic horn-ish lead with vibrato."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    vib = vib_depth * np.sin(2 * np.pi * vibrato * t) * np.minimum(t / 0.25, 1.0)
    f = midi_to_freq(midi)
    inst = np.cumsum(2 * np.pi * (f + vib) / SR)
    x = (0.55 * _sig.sawtooth(inst) + 0.30 * np.sin(inst)
         + 0.15 * np.sin(2 * inst))
    x = lowpass(x, 3200)
    return x * adsr(n, 0.05, 0.15, 0.85, min(0.3, dur * 0.3)) * vel * 0.5


def pluck(midi, dur=2.0, vel=1.0):
    """Karplus-Strong plucked string."""
    f = midi_to_freq(midi)
    N = max(int(SR / f), 2)
    n = int(dur * SR)
    buf = _rng.standard_normal(N)
    y = np.zeros(n)
    idx = 0
    prev = 0.0
    for i in range(n):
        cur = buf[idx]
        y[i] = cur
        nxt = 0.996 * 0.5 * (cur + buf[(idx + 1) % N])
        buf[idx] = nxt
        idx = (idx + 1) % N
    y *= np.exp(-np.arange(n) / SR * 1.1)
    return y * vel * 0.6


def wind(dur, vel=1.0):
    """Airy texture bed for ambient."""
    n = int(dur * SR)
    x = noise(n)
    # slow amplitude swells
    t = np.arange(n) / SR
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * t + 1.0)
    swell *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.031 * t)
    x = lowpass(x, 600) * swell
    return x * vel * 0.35


# -------------------------------------------------------------- arrangement
class Track:
    """A stem: mono buffer with beat-based placement."""

    def __init__(self, bpm, total_beats):
        self.bpm = bpm
        self.total_beats = total_beats
        self.buf = np.zeros(int(secs(total_beats, bpm) * SR) + SR, dtype=np.float64)

    def _place(self, x, start_beat):
        s = int(secs(start_beat, self.bpm) * SR)
        e = min(s + len(x), len(self.buf))
        if s < len(self.buf) and e > s:
            self.buf[s:e] += x[: e - s]

    # -- drums (times in beats)
    def kick(self, b, **kw): self._place(kick(**kw), b)
    def taiko(self, b, **kw): self._place(taiko(**kw), b)
    def snare(self, b, **kw): self._place(snare(**kw), b)
    def tom(self, b, **kw): self._place(tom(**kw), b)
    def hat(self, b, **kw): self._place(hat(**kw), b)
    def crash(self, b, **kw): self._place(crash(**kw), b)

    # -- tonal (times in beats; dur in beats)
    def _b2s(self, beats):
        return secs(beats, self.bpm)

    def bass(self, b, midi, dur_beats, **kw):
        self._place(bass_note(midi, self._b2s(dur_beats), **kw), b)

    def pad(self, b, midis, dur_beats, **kw):
        self._place(pad_chord(midis, self._b2s(dur_beats), **kw), b)

    def brass(self, b, midi, dur_beats, **kw):
        self._place(brass_note(midi, self._b2s(dur_beats), **kw), b)

    def lead(self, b, midi, dur_beats, **kw):
        self._place(lead_note(midi, self._b2s(dur_beats), **kw), b)

    def pluck(self, b, midi, dur_beats=4, **kw):
        self._place(pluck(midi, self._b2s(dur_beats), **kw), b)

    def wind(self, b, dur_beats, **kw):
        self._place(wind(self._b2s(dur_beats), **kw), b)

    def trim(self):
        self.buf = self.buf[: int(secs(self.total_beats, self.bpm) * SR)]
        return self


def reverb_stereo(x, wet=0.22, decay=2.0, seed=7):
    """Convolution reverb, returns stereo."""
    rng = np.random.default_rng(seed)
    ir_len = int(decay * SR)
    t = np.arange(ir_len) / SR
    ir_l = rng.standard_normal(ir_len) * np.exp(-t * 3.2 / decay)
    ir_r = rng.standard_normal(ir_len) * np.exp(-t * 3.4 / decay)
    wl = _sig.fftconvolve(x, ir_l, mode="full")[: len(x)]
    wr = _sig.fftconvolve(x, ir_r, mode="full")[: len(x)]
    # normalize IR energy
    wl *= 0.25 / (np.sqrt(np.mean(ir_l ** 2)) + 1e-9)
    wr *= 0.25 / (np.sqrt(np.mean(ir_r ** 2)) + 1e-9)
    dry = np.stack([x, x], axis=1)
    wet_ = np.stack([wl, wr], axis=1)
    return dry * (1 - wet) + wet_ * wet


def limiter(x, ceiling=0.89):
    """Soft-clip + normalize to ceiling."""
    peak = np.max(np.abs(x))
    if peak > 0:
        x = x / peak * 1.05
    x = np.tanh(x * 1.1)
    peak = np.max(np.abs(x))
    return (x / peak * ceiling).astype(np.float32)


def write_wav(path, x):
    import wave
    x = np.clip(x, -1, 1)
    pcm = (x * 32767).astype(np.int16)
    ch = 1 if x.ndim == 1 else x.shape[1]
    with wave.open(path, "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
