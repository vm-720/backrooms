# The Backrooms: Level 0

A first-person browser game. You wake up in an endless maze of yellow rooms, humming lights and damp carpet. Find the exit.

**Play:** https://vm-720.github.io/backrooms/

## Controls

| Key | Action |
| --- | --- |
| W A S D | Walk |
| Mouse | Look |
| Shift | Run (about 7 seconds before you're out of breath) |
| Esc | Pause, change mouse sensitivity and volume |

Every run builds a new maze. Add `?seed=1234` to the link to replay a specific one.

## How it's built

- [Three.js](https://threejs.org) in plain HTML and JavaScript, no build step. Hosted on GitHub Pages.
- `src/maze.js` builds the level from a seed: a maze, open rooms with pillars, loops and half-walls, and an exit far from the start.
- `src/main.js` is the game: rendering, the player, collisions, flickering lights, screens.
- `src/textures.js` paints every texture in code, and `src/audio.js` synthesises every sound, so there are no asset files to license.
- `npm test` checks 200 mazes to make sure every cell and the exit can be reached.

See [CREDITS.md](CREDITS.md) for licences.

## Running it on your own computer

Browsers block modules opened straight from a file, so serve the folder first, for example with `python -m http.server`, then open http://localhost:8000.
