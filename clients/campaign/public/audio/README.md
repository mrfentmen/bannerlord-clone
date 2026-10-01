# Audio pipeline contract

The campaign client loads audio from these paths at runtime. Drop pipeline
outputs here; the client plays them lazily and stays silent when a file is
missing, so empty directories are fine.

## SFX (one-shot, triggered by named events in `src/audio/audio.ts`)

| File | Event name | Trigger |
| ---- | ---------- | ------- |
| `sfx/ui-click.mp3` | `ui.click` | any UI button click |
| `sfx/panel-open.mp3` | `ui.panel-open` | a panel/screen opens |
| `sfx/panel-close.mp3` | `ui.panel-close` | a panel/screen closes |
| `sfx/hit.mp3` | `combat.hit` | a hit lands in battle |
| `sfx/shot.mp3` | `combat.shot` | a shot is fired |
| `sfx/kill.mp3` | `combat.kill` | a combatant goes down |
| `sfx/construction-complete.mp3` | `construction.complete` | a town project finishes |
| `sfx/notification.mp3` | `notification.alert` | an alert or notification |
| `sfx/game-win.mp3` | `tavern.game-win` | tavern game won |
| `sfx/game-lose.mp3` | `tavern.game-lose` | tavern game lost |

## Radio (task 149)

One file per station: `radio/<station-id>.mp3`. The client ships three
station entries (`station-street`, `station-night`, `station-talk`); add a
row to `RADIO_STATIONS` in `src/audio/radio.ts` per new file. The radio
plays on the tavern and town screens.

## Battle ambience (task 150)

`ambience/crowd-loop.mp3`: a loopable crowd bed. The client scales its gain
with the live unit count (0 units = quiet murmur, 400 units = full roar).
