# Doom telemetry demo (Tableau data app proof of concept)

Doom (shareware Episode 1) running in the browser as WebAssembly, with a live telemetry panel (health, armor, ammo, kills, player track) and a session recorder that exports CSVs. Built as a proof of concept for showing a game-style app alongside Tableau dashboards.

Click the game to focus it. Arrows move, Ctrl fires, Space uses, Shift runs, 1-7 pick weapons, Esc opens the menu. Sound starts after your first click or key press.

## Credits and licenses
- Engine: [doomgeneric](https://github.com/ozkl/doomgeneric), a portable fork of the id Software DOOM source release, under the GNU GPL v2 (see `LICENSE`).
- Original game and source: id Software. DOOM is a trademark of id Software / ZeniMax. This project is an unofficial fan demo, not affiliated with or endorsed by them.
- `doom1.wad`: the shareware Episode 1 data file, distributed unmodified under the shareware terms that permit redistribution. The registered game data (full game) is not included.
- Browser platform layer, sound and telemetry glue: `src/` (GPL-2.0-or-later, same as the engine) and the JavaScript files in this folder.

## Rebuilding `doom.wasm`
Needs git and Python with `pip install ziglang`. Run `src/build.sh` from the `src/` folder. It downloads doomgeneric, applies a one-line patch so the in-memory WAD is found, and compiles with `zig cc -target wasm32-wasi`.

## Files
- `index.html`: the page (game, telemetry, recorder).
- `doom-runtime.js`, `doom-audio.js`: WebAssembly glue and WebAudio sound/music.
- `doom.wasm`, `doom1.wad`: engine build and shareware data.
- `src/`: the C platform files and build script (GPL source for `doom.wasm`).
