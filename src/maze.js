// Level 0 layout: a seeded maze of cells with thin walls on their edges.
// Pure data, no Three.js, so it can be tested in Node.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CELL = 4; // metres per cell
export const WALL_T = 0.2; // wall thickness
export const WALL_H = 3; // ceiling height

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function generateMaze(seed, W = 60, H = 60) {
  const rng = makeRng(seed);
  const rand = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

  // hWalls[j][i]: wall along z = j, between cell (i, j-1) and (i, j). j in 0..H
  // vWalls[j][i]: wall along x = i, between cell (i-1, j) and (i, j). i in 0..W
  const hWalls = Array.from({ length: H + 1 }, () => new Array(W).fill(true));
  const vWalls = Array.from({ length: H }, () => new Array(W + 1).fill(true));
  const room = Array.from({ length: H }, () => new Array(W).fill(false));

  const setWall = (x, z, d, on) => {
    if (d === 0) hWalls[z][x] = on;
    else if (d === 2) hWalls[z + 1][x] = on;
    else if (d === 3) vWalls[z][x] = on;
    else vWalls[z][x + 1] = on;
  };
  const hasWall = (x, z, d) => {
    if (d === 0) return hWalls[z][x];
    if (d === 2) return hWalls[z + 1][x];
    if (d === 3) return vWalls[z][x];
    return vWalls[z][x + 1];
  };

  // 1. Perfect maze with an iterative recursive backtracker.
  const seen = Array.from({ length: H }, () => new Array(W).fill(false));
  const stack = [[rand(0, W - 1), rand(0, H - 1)]];
  seen[stack[0][1]][stack[0][0]] = true;
  while (stack.length) {
    const [x, z] = stack[stack.length - 1];
    const options = [];
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0];
      const nz = z + DIRS[d][1];
      if (nx >= 0 && nz >= 0 && nx < W && nz < H && !seen[nz][nx]) options.push(d);
    }
    if (!options.length) {
      stack.pop();
      continue;
    }
    const d = options[Math.floor(rng() * options.length)];
    setWall(x, z, d, false);
    const nx = x + DIRS[d][0];
    const nz = z + DIRS[d][1];
    seen[nz][nx] = true;
    stack.push([nx, nz]);
  }

  // 2. Open rooms: clear every wall inside a rectangle. Big ones get pillars.
  const pillars = [];
  const roomCount = Math.round((W * H) / 180);
  for (let r = 0; r < roomCount; r++) {
    const rw = rand(2, 7);
    const rh = rand(2, 7);
    const rx = rand(0, W - rw);
    const rz = rand(0, H - rh);
    for (let z = rz; z < rz + rh; z++) {
      for (let x = rx; x < rx + rw; x++) {
        room[z][x] = true;
        if (x > rx) vWalls[z][x] = false;
        if (z > rz) hWalls[z][x] = false;
      }
    }
    if (rw >= 4 && rh >= 4 && rng() < 0.6) {
      const step = rng() < 0.5 ? 1 : 2;
      for (let j = rz + 1; j < rz + rh; j += step) {
        for (let i = rx + 1; i < rx + rw; i += step) pillars.push([i, j]);
      }
    }
  }

  // 3. Knock out random walls so the maze loops back on itself.
  const stubs = [];
  for (let j = 1; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (hWalls[j][i] && rng() < 0.3) {
        hWalls[j][i] = false;
        // Sometimes leave half a wall standing: a doorway with no door.
        if (rng() < 0.12) stubs.push({ axis: 'h', i, j, end: rng() < 0.5 ? 0 : 1 });
      }
    }
  }
  for (let j = 0; j < H; j++) {
    for (let i = 1; i < W; i++) {
      if (vWalls[j][i] && rng() < 0.3) {
        vWalls[j][i] = false;
        if (rng() < 0.12) stubs.push({ axis: 'v', i, j, end: rng() < 0.5 ? 0 : 1 });
      }
    }
  }

  // Drop pillars that would touch a wall, so they only stand in open space.
  const freePillars = pillars.filter(([i, j]) => {
    const touching =
      (j > 0 && vWalls[j - 1][i]) ||
      (j < H && vWalls[j][i]) ||
      (i > 0 && hWalls[j][i - 1]) ||
      (i < W && hWalls[j][i]);
    return !touching && !stubs.some((s) => (s.axis === 'h' ? s.j === j && (s.i === i || s.i === i - 1) : s.i === i && (s.j === j || s.j === j - 1)));
  });

  // 4. Start in the middle, then measure walking distance to every cell.
  const start = [Math.floor(W / 2), Math.floor(H / 2)];
  const dist = bfs(W, H, hasWall, start);

  // 5. Exit: a cell on the outer edge that is a long, but not the longest, walk away.
  const edge = [];
  for (let x = 0; x < W; x++) {
    edge.push([x, 0, 0], [x, H - 1, 2]);
  }
  for (let z = 1; z < H - 1; z++) {
    edge.push([0, z, 3], [W - 1, z, 1]);
  }
  edge.sort((a, b) => dist[a[1]][a[0]] - dist[b[1]][b[0]]);
  const lo = Math.floor(edge.length * 0.6);
  const hi = Math.floor(edge.length * 0.9);
  const [ex, ez, side] = edge[rand(lo, hi)];
  setWall(ex, ez, side, false);

  return {
    seed,
    W,
    H,
    hWalls,
    vWalls,
    room,
    pillars: freePillars,
    stubs,
    start,
    exit: { x: ex, z: ez, side },
    dist,
    hasWall,
  };
}

export function bfs(W, H, hasWall, [sx, sz]) {
  const dist = Array.from({ length: H }, () => new Array(W).fill(-1));
  dist[sz][sx] = 0;
  const q = [[sx, sz]];
  for (let h = 0; h < q.length; h++) {
    const [x, z] = q[h];
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0];
      const nz = z + DIRS[d][1];
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      if (hasWall(x, z, d) || dist[nz][nx] !== -1) continue;
      dist[nz][nx] = dist[z][x] + 1;
      q.push([nx, nz]);
    }
  }
  return dist;
}

// Every solid box in the level as an axis-aligned rectangle on the floor plan.
// kind: 'wall' (full edge), 'stub' (half edge) or 'pillar'.
export function collectSolids(maze) {
  const { W, H, hWalls, vWalls, pillars, stubs } = maze;
  const S = CELL;
  const T = WALL_T;
  const solids = [];
  for (let j = 0; j <= H; j++) {
    for (let i = 0; i < W; i++) {
      if (hWalls[j][i]) solids.push({ kind: 'wall', axis: 'h', cx: (i + 0.5) * S, cz: j * S, sx: S + T, sz: T });
    }
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i <= W; i++) {
      if (vWalls[j][i]) solids.push({ kind: 'wall', axis: 'v', cx: i * S, cz: (j + 0.5) * S, sx: T, sz: S + T });
    }
  }
  for (const s of stubs) {
    const len = S / 2;
    if (s.axis === 'h') {
      const x0 = s.i * S + (s.end ? S - len : 0);
      solids.push({ kind: 'stub', axis: 'h', cx: x0 + len / 2, cz: s.j * S, sx: len + T, sz: T });
    } else {
      const z0 = s.j * S + (s.end ? S - len : 0);
      solids.push({ kind: 'stub', axis: 'v', cx: s.i * S, cz: z0 + len / 2, sx: T, sz: len + T });
    }
  }
  for (const [i, j] of pillars) {
    solids.push({ kind: 'pillar', axis: 'h', cx: i * S, cz: j * S, sx: 0.7, sz: 0.7 });
  }
  return solids;
}
