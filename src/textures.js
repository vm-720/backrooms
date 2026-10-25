// All surface textures are painted in code on canvases, so the game ships
// with no image files and no licences to track.
import * as THREE from '../vendor/three.module.min.js';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function noise(ctx, size, amount, rng = Math.random) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let p = 0; p < d.length; p += 4) {
    const n = (rng() - 0.5) * amount;
    d[p] += n;
    d[p + 1] += n;
    d[p + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx, size, count, color, maxR, alpha) {
  for (let k = 0; k < count; k++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = maxR * (0.3 + Math.random() * 0.7);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${alpha})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    // Draw wrapped copies so the texture still tiles seamlessly.
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.save();
        ctx.translate(dx, dy);
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.restore();
      }
    }
  }
}

function toTexture(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Mono-yellow wallpaper: faint vertical bands with a small repeating motif.
export function wallpaperTexture() {
  const size = 512;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#c8b866';
  ctx.fillRect(0, 0, size, size);
  const band = size / 8;
  for (let b = 0; b < 8; b++) {
    ctx.fillStyle = b % 2 ? 'rgba(120,100,30,0.07)' : 'rgba(255,245,180,0.06)';
    ctx.fillRect(b * band, 0, band, size);
    ctx.fillStyle = 'rgba(110,90,30,0.18)';
    ctx.fillRect(b * band, 0, 2, size);
  }
  // Chevron motif down the middle of each band.
  ctx.strokeStyle = 'rgba(115,95,35,0.22)';
  ctx.lineWidth = 2;
  for (let b = 0; b < 8; b++) {
    const cx = b * band + band / 2;
    for (let y = 0; y < size; y += 32) {
      ctx.beginPath();
      ctx.moveTo(cx - 9, y + 10);
      ctx.lineTo(cx, y + 2);
      ctx.lineTo(cx + 9, y + 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, y + 20, 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  blotches(ctx, size, 6, '110,90,40', 90, 0.12);
  noise(ctx, size, 18);
  return toTexture(c);
}

// Damp, slightly patchy beige carpet.
export function carpetTexture() {
  const size = 512;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#9c8a55';
  ctx.fillRect(0, 0, size, size);
  for (let k = 0; k < 9000; k++) {
    const v = 120 + Math.random() * 60;
    ctx.fillStyle = `rgba(${v},${v * 0.88},${v * 0.55},0.35)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  blotches(ctx, size, 10, '70,58,30', 110, 0.22);
  noise(ctx, size, 30);
  return toTexture(c);
}

// Drop ceiling: 2 x 2 tiles per texture with metal grid lines and pinholes.
export function ceilingTexture() {
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#d9d3b4';
  ctx.fillRect(0, 0, size, size);
  for (let k = 0; k < 1500; k++) {
    ctx.fillStyle = 'rgba(90,80,50,0.35)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }
  blotches(ctx, size, 2, '150,130,70', 50, 0.18);
  ctx.fillStyle = '#a69f80';
  const half = size / 2;
  for (const p of [0, half]) {
    ctx.fillRect(p, 0, 4, size);
    ctx.fillRect(0, p, size, 4);
  }
  noise(ctx, size, 10);
  return toTexture(c);
}

// The diffuser grid on a fluorescent panel.
export function lightPanelTexture() {
  const [c, ctx] = canvas(128);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(200,200,180,0.5)';
  for (let k = 0; k < 128; k += 8) {
    ctx.fillRect(k, 0, 1, 128);
    ctx.fillRect(0, k, 128, 1);
  }
  ctx.strokeStyle = '#bdb8a0';
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function exitSignTexture() {
  const [c, ctx] = canvas(256);
  c.height = 96;
  ctx.fillStyle = '#1a0606';
  ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = '#ff2a1a';
  ctx.font = 'bold 64px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', 128, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
