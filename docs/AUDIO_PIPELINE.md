# Audio Pipeline (Pax task 79)

## Overview

The game uses Web Audio API via `AudioManager` (`src/audio/AudioManager.ts`).
All 109 audio files live in `public/audio/`.

## Categories

- **Music** (`public/audio/*.mp3`): battle-theme, menu-theme, victory-fanfare, defeat, ambient-exploration, etc.
- **SFX** (`public/audio/sfx/`):
  - `weapon/`: rifle, pistol, shotgun, smg-burst, reload, dry-fire, explosion, explosion-small
  - `foley/`: footsteps, movement sounds
  - `ui/`: click, confirm, error, hover, toggle
  - `vehicle/`: engine, movement
  - `ambience/`: environmental loops
  - `radio/`: radio chatter

## API

```ts
const audio = new AudioManager();
await audio.init();

// Music
audio.playMusic('battle-theme');
audio.stopMusic();

// SFX
audio.playSfx('sfx-weapon-rifle');
audio.playSfx('sfx-weapon-rifle', { volume: 0.8, rate: 1.1 });

// UI
audio.playUiSound('click');

// Volume (0-1 per category)
audio.setVolume('music', 0.7);
audio.setVolume('sfx', 0.9);
audio.setVolume('ambient', 0.5);

// Mute
audio.setMuted(true);
```

## Performance

- Audio files are lazy-loaded on first play (not preloaded)
- 109 files total, largest music tracks ~3-5MB
- SFX are small (<500KB each), suitable for rapid playback
- Web Audio API handles mixing; no manual pooling needed for this scale

## Battle Integration

BattleScene triggers:
- `playMusic('battle-theme')` on battle start
- `playSfx('sfx-weapon-rifle')` on shots (via BattleSoldier or combat system)
- `playMusic('victory-fanfare')` or `playMusic('defeat')` on battle end
