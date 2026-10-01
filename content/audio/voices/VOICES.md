# Combat Voice Lines

Voiced battle barks from content/dialogue/combat-barks.md. Every MP3 has a
matching TXT file with the exact lines spoken, in order. File naming:
<class>-<batch>.mp3, so infantry-2.mp3 pairs with infantry-2.txt.

## Voices

| Class     | Voice ID              | Character                              |
|-----------|-----------------------|----------------------------------------|
| infantry  | avocado_v2:vincent    | Gruff Brick, direct no-nonsense older  |
| scout     | avocado_v2:Twenty     | Bold Flag, heroic young energetic      |
| gunner    | avocado_v2:Argue      | Intense Cymbal, aggressive intense     |
| medic     | avocado_v2:vdc_2561   | Tender Cushion, caring deep warm older |
| captain   | avocado_v2:vdc_5723   | Solemn Pillar, forceful serious        |
| troop     | avocado_v2:chip       | Warm Pebble, warm professional         |
| companion | avocado_v2:miles      | Satiny Moon, soothing deep young       |
| townsman  | avocado_v2:ronan      | Fluid Hammock, friendly casual         |
| townswoman| avocado_v2:MAI_01     | Aria, warm friendly American           |
| italian   | avocado_v2:vdc_14595    | Thoughtful Boot, tough New York M      |
| irish     | avocado_v2:conor        | Polished Coin, relaxed Irish M         |
| chinese   | avocado_v2:vd2_steady_riverstone | Steadying Riverstone, calm Chinese M |
| korean    | avocado_v2:vd2_bright_thistle | Tart Thistle, sharp Korean F       |
| african   | avocado_v2:NoSugar      | Calm Bridge, calm African American M   |
| jamaican  | avocado_v2:vd2_jovial_drum | Mirthful Drum, warm Jamaican M     |
| mexican   | avocado_v2:vd2_bold_sled| Stubborn Sled, defiant Latin Am. M     |
| puertorican| avocado_v2:pirate-4    | Rugged Hull, rugged Caribbean M        |
| german    | avocado_v2:vd2_dry_tambour | Dry Tambour, dry German M          |
| russian   | avocado_v2:vdc_17383    | Jovial Cello, jovial Eastern Eur. F    |
| siege_attacker | avocado_v2:vdc_3944 | Blustery Gong, assault shouts, energetic M |
| siege_defender | avocado_v2:vdc_13210 | Grumpy Cloud, desperate defense, exasperated M |
| persuader | avocado_v2:vdc_23566 | Smooth Handshake, persuasive New York M |
| haggler   | avocado_v2:vdc_3756 | Prudent Seed, businesslike M |
| announcer | avocado_v2:vdc_NOID102 | Lofty Throne, authoritative M |
| marisol   | avocado_v2:vdc_24027 | Decisive Hammer, brash F (Pacific Compact) |
| hollis    | avocado_v2:vdc_22255 | Rumpled Armchair, avuncular M (Mountain Alliance) |
| bernice   | avocado_v2:vdc_6534 | Unhurried Clock, methodical F (Great Lakes Union) |
| cordell   | avocado_v2:casper | Confident Chime, confident M (Southern Compact) |
| royce     | avocado_v2:vd2_r82_rep5k_0244_v068_28k_g5k | Confident Smokehouse, gravelly Southern M (Lone Star Frontier) |
| yvonne    | avocado_v2:qvd_03269 | Commanding Arch, commanding F (Atlantic Corridor) |
| rebel     | avocado_v2:vdc_NOID29 | Cranky Sandpaper, irascible M |
| executioner | avocado_v2:qvd_01700 | Somber Monument, grim M |
| merchant2 | avocado_v2:vdc_12430 | Neighborly Gate, friendly M |
| bartender | avocado_v2:qvd_01645 | Weathered Hinge, tough gruff M (picked 2026-10-01 for bartender-2) |
| shopkeeper | avocado_v2:vdc_24103 | Gracious Scarf, friendly helpful M (picked 2026-10-01 for shopkeeper-2) |

## Batches

- Batch 1: first sample set, one file per class (5 to 6 lines each).
- Batch 2: second set, new lines, no repeats from batch 1 (5 to 9 lines each).
- Batch 3: remaining lines for infantry, scout, gunner, medic, companion;
  fresh captain orders and troop morale lines (2 to 10 lines each).
- Batch 4: the last captain orders and more troop lines, plus the first
  townsfolk ambient set (townsman, townswoman) from townsfolk.md.

Lines come straight from combat-barks.md, plain ASCII, no stage directions.

## Batch 7: siege, persuasion, leaders, and more (2026-09-30)

- siege-attacker-1: assault shouts from sieges.md push orders and breach callouts.
- siege-defender-1: desperate defense lines from sieges.md panic lines.
- persuade-1: original smooth-talker persuasion lines, in-style.
- barter-1: mechanic and gun-dealer haggling lines from tavern-merchants.md.
- announcer-1: original tournament announcer set, in-style.
- leader-1 through leader-6: one speech each for the six faction leaders,
  written in-character from faction-leaders.md (Marisol, Hollis, Bernice,
  Cordell, Royce, Yvonne).
- rebel-1: original rebellion rally lines, in-style.
- execution-1: original grim execution lines, in-style.
- merchant-2: original second-merchant lines, in-style.
- townsman-2, townswoman-2: new ambient lines in townsfolk.md style, reusing
  the established townsman/townswoman voices for consistency.

## Batch 8: round-2 barks, ethnic callouts, ambient, leader sets (2026-10-01)

- siege-attacker-2, siege-defender-2, persuade-2, barter-2, announcer-2,
  rebel-2, execution-2: second sets in the same established voices as batch 7
  (assault breach callouts, desperate defense, smooth-talker persuasion,
  haggling, tournament announcements, rebellion rally, grim execution lines).
- african-2 through russian-2: second short in-character callout sets for all
  ten ethnicity voices, same voice IDs as batch 1.
- townsman-3 (ronan), townswoman-3 (MAI_01): town ambient chatter in
  townsfolk.md style.
- bartender-2: tough male bartender lines in tavern-merchants.md style.
  Voice picked from voice_source.json: avocado_v2:qvd_01645 (Weathered Hinge,
  Masculine, American, Low, Gruff). VOICES.md previously had no voice ID for
  the bartender role.
- shopkeeper-2: friendly shopkeeper lines in tavern-merchants.md style.
  Voice picked from voice_source.json: avocado_v2:vdc_24103 (Gracious Scarf,
  Masculine, American, Deep, Helpful). VOICES.md previously had no voice ID
  for the shopkeeper role.
- merchant-3 (vdc_12430): more merchant lines in tavern-merchants.md style.
- leader-1b through leader-6b: second order/speech sets for all six faction
  leaders, in-character from content/characters/faction-leaders.md, same
  voice IDs (Marisol vdc_24027, Hollis vdc_22255, Bernice vdc_6534,
  Cordell casper, Royce vd2_r82_rep5k_0244_v068_28k_g5k, Yvonne qvd_03269).

voice-map.json: ambient.tavern gained bartender-2, shopkeeper-2, merchant-3;
ambient.town gained townsman-3, townswoman-3; ethnicity_callout values are now
2-file lists; leaders values are now 2-file lists (leader-N.mp3 +
leader-Nb.mp3); round-2 files were also appended to their trigger lists
(siege_attack, siege_defense, persuade, barter, tournament, rebellion,
execution). All 28 files verified with ffprobe (valid MP3, 11 to 37 seconds
each), each with a matching .txt transcript.
