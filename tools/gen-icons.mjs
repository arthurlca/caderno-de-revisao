// Gera os ícones PNG do app sem dependências (node:zlib + rasterizador simples).
// Uso: node tools/gen-icons.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

const BRAND = [0x0f, 0x76, 0x6e];
const BRAND_2 = [0x14, 0xb8, 0xa6];
const LINE = [0xb6, 0xc9, 0xc6];
const WHITE = [255, 255, 255];

// Distância com sinal até um retângulo arredondado (coordenadas 0..1)
function sdRoundRect(x, y, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2 - r, hy = (y1 - y0) / 2 - r;
  const qx = Math.abs(x - cx) - hx, qy = Math.abs(y - cy) - hy;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * @param {number} size
 * @param {{rounded: boolean, scale: number}} opt  rounded: fundo com cantos (ícone "any");
 *        scale: encolhe o desenho para a zona segura (maskable)
 */
function draw(size, { rounded, scale }) {
  const SS = 4; // supersampling 4x4
  const px = new Uint8Array(size * size * 4);
  // Folha de questões: três alternativas, a do meio marcada
  const shapes = [
    { rect: [0.25, 0.17, 0.75, 0.83, 0.06], color: WHITE, alpha: 1 },
    { rect: [0.32, 0.27, 0.42, 0.37, 0.05], color: LINE, alpha: 1 },
    { rect: [0.46, 0.295, 0.68, 0.345, 0.025], color: LINE, alpha: 1 },
    { rect: [0.32, 0.45, 0.42, 0.55, 0.05], color: BRAND_2, alpha: 1 },
    { rect: [0.46, 0.475, 0.68, 0.525, 0.025], color: BRAND, alpha: 1 },
    { rect: [0.32, 0.63, 0.42, 0.73, 0.05], color: LINE, alpha: 1 },
    { rect: [0.46, 0.655, 0.62, 0.705, 0.025], color: LINE, alpha: 1 },
  ];

  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (pxl + (sx + 0.5) / SS) / size;
          const v = (py + (sy + 0.5) / SS) / size;
          // fundo com leve gradiente vertical
          const inBg = rounded ? sdRoundRect(u, v, 0, 0, 1, 1, 0.22) <= 0 : true;
          if (!inBg) continue;
          const t = v;
          let c = [
            BRAND[0] + (BRAND_2[0] - BRAND[0]) * (1 - t) * 0.6,
            BRAND[1] + (BRAND_2[1] - BRAND[1]) * (1 - t) * 0.6,
            BRAND[2] + (BRAND_2[2] - BRAND[2]) * (1 - t) * 0.6,
          ];
          // desenho escalado em torno do centro
          const x = (u - 0.5) / scale + 0.5, y = (v - 0.5) / scale + 0.5;
          for (const s of shapes) {
            const [x0, y0, x1, y1, rr] = s.rect;
            if (sdRoundRect(x, y, x0, y0, x1, y1, rr) <= 0) {
              c = c.map((ch, i) => ch * (1 - s.alpha) + s.color[i] * s.alpha);
            }
          }
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const n = SS * SS;
      const o = (py * size + pxl) * 4;
      const cov = a / n;
      // cores pré-multiplicadas → reverter para RGBA normal
      px[o] = cov ? Math.round((r / n) * (255 / cov)) : 0;
      px[o + 1] = cov ? Math.round((g / n) * (255 / cov)) : 0;
      px[o + 2] = cov ? Math.round((b / n) * (255 / cov)) : 0;
      px[o + 3] = Math.round(cov);
    }
  }
  return px;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, rgba, opaque) {
  const channels = opaque ? 3 : 4;
  const raw = Buffer.alloc((size * channels + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * channels + 1);
    raw[row] = 0; // sem filtro
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const o = row + 1 + x * channels;
      raw[o] = rgba[i]; raw[o + 1] = rgba[i + 1]; raw[o + 2] = rgba[i + 2];
      if (!opaque) raw[o + 3] = rgba[i + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = opaque ? 2 : 6; // RGB ou RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const targets = [
  // iOS arredonda sozinho: fundo cheio, sem transparência
  { file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 1, opaque: true },
  { file: 'icon-192.png', size: 192, rounded: true, scale: 1, opaque: false },
  { file: 'icon-512.png', size: 512, rounded: true, scale: 1, opaque: false },
  // maskable: desenho dentro da zona segura (80% central)
  { file: 'icon-maskable-512.png', size: 512, rounded: false, scale: 0.8, opaque: true },
];
for (const t of targets) {
  const buf = png(t.size, draw(t.size, t), t.opaque);
  writeFileSync(join(OUT, t.file), buf);
  console.log(`icons/${t.file}  ${t.size}x${t.size}  ${(buf.length / 1024).toFixed(1)} KB`);
}
