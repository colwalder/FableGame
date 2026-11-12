# Lament of Chernobrod

A dark-fantasy, soulslike action RPG set in a cursed Slavic village. Everything —
world, characters, animation, sound effects and the adaptive score — is generated
in code at runtime (Three.js + WebAudio). No build step, no asset files.

## Run

```bash
python3 serve.py
```

Then open http://localhost:5173 in a desktop browser (Chrome recommended).

## Controls

| Action | Keyboard / mouse | Gamepad |
| --- | --- | --- |
| Move / look | WASD / mouse (arrow keys also turn the camera) | Left / right stick |
| Sprint | Shift | A (hold) |
| Roll (i-frames) | Space | B |
| Light attack (3-hit combo) | LMB or J | RB |
| Whirlwind (heavy) | RMB or K | RT |
| Lock on | Q or middle mouse | R3 |
| Drink flask | R | X |
| Play flute | F | Y |
| Interact / read | E | A |
| Journal | Tab | Back |

## Notes

- Kindle wayside shrines to set a checkpoint, refill flasks and spend silver on
  Vigor / Endurance / Strength. Resting brings the lesser dead back.
- Dying drops your silver where you fell; walk over it to recover it.
- The flute takes three seconds and leaves you open (hits hurt more and break the
  song), but grants the Shepherd's Lament: harder blows, faster stamina, slow healing.
- There are 13 clues to find. Some are off the road; two only answer to the flute.
  What you learn changes how the story can end.

## Layout

- `src/main.js` — game loop, camera, triggers, endings
- `src/world/` — terrain, village construction, story text
- `src/chars/` — procedural rigs, models and pose library
- `src/game/` — player, enemies, the two bosses, hazards, HUD
- `src/audio/` — synthesised SFX and the layered, state-driven score
- `vendor/three/` — Three.js r170 (MIT)
