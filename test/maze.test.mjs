import { generateMaze, collectSolids } from '../src/maze.js';
let fail = 0;
const ds = [];
for (let seed = 1; seed <= 200; seed++) {
  const m = generateMaze(seed);
  let unreached = 0;
  for (const row of m.dist) for (const d of row) if (d < 0) unreached++;
  if (unreached) { console.log('seed', seed, 'unreachable cells', unreached); fail++; }
  const d = m.dist[m.exit.z][m.exit.x];
  ds.push(d);
  if (m.hasWall(m.exit.x, m.exit.z, m.exit.side)) { console.log('seed', seed, 'exit closed'); fail++; }
  const solids = collectSolids(m);
  if (seed === 1) console.log('solids', solids.length, 'pillars', m.pillars.length, 'stubs', m.stubs.length);
}
ds.sort((a, b) => a - b);
console.log('exit path length in cells: min', ds[0], 'median', ds[100], 'max', ds[199]);
console.log(fail ? `FAIL ${fail}` : 'all 200 seeds ok');
process.exit(fail ? 1 : 0);
