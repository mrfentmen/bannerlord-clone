# Game music generator

Original procedural music for the Bannerlord-clone, synthesized from scratch
with numpy DSP - no samples, no recordings, no licensing issues.

- `synth.py`: the engine. Every instrument is a function returning a float32
  buffer at 44100 Hz: kick (pitch-dropping sine + noise click), taiko war
  drum, snare, hats, toms, crash, bass (detuned saws + lowpass + sub),
  string pads (detuned saw stacks, slow attack), brass (filter opens on
  attack), heroic lead (saw + vibrato), Karplus-Strong pluck, wind beds.
  ADSR on everything, convolution reverb, tanh limiter.
- `compose.py`: the compositions. Real music theory - minor-key
  progressions (i-VI-III-VII), drum patterns per section
  (intro/build/main/outro), bass ostinatos, melodies with vibrato.
  Each instrument group renders as its own STEM wav; the mix sums stems
  with per-stem gains.

Regenerate: `python3 compose.py` in this directory (needs numpy, scipy),
then mp3 via ffmpeg. Stems let the client do dynamic battle layers
(ART_AND_AUDIO.md section 8.1).
