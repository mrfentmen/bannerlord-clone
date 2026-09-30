/** Counts how many sampled pixels differ from the clear colour, i.e. did anything rasterize. */
import zlib from "node:zlib";
import fs from "node:fs";

function readPng(p) {
  const d = fs.readFileSync(p);
  let off = 8, idat = [], w = 0, h = 0, ct = 0;
  while (off < d.length) {
    const len = d.readUInt32BE(off), typ = d.toString("ascii", off + 4, off + 8);
    if (typ === "IHDR") { w = d.readUInt32BE(off + 8); h = d.readUInt32BE(off + 12); ct = d[off + 17]; }
    else if (typ === "IDAT") idat.push(d.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const nch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  const stride = w * nch, out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride), pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++]; const line = Buffer.from(raw.subarray(pos, pos + stride)); pos += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= nch ? line[i - nch] : 0, b = prev[i], c = i >= nch ? prev[i - nch] : 0;
      if (f === 1) line[i] = (line[i] + a) & 255;
      else if (f === 2) line[i] = (line[i] + b) & 255;
      else if (f === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(out, y * stride); prev = line;
  }
  return { w, h, nch, px: out };
}

for (const f of process.argv.slice(2)) {
  const { w, h, nch, px } = readPng(f);
  const bg = [px[0], px[1], px[2]];
  let diff = 0, opaque = 0, sampled = 0;
  const cols = new Map();
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const i = (y * w + x) * nch; sampled++;
    if (px[i + 3] > 8) opaque++;
    if (Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) > 18) diff++;
    const k = `${px[i]},${px[i + 1]},${px[i + 2]}`;
    cols.set(k, (cols.get(k) ?? 0) + 1);
  }
  const top = [...cols.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  console.log(`${f}: ${w}x${h} bg=${bg.join(",")} drawn=${(diff / sampled * 100).toFixed(2)}% ` +
    `opaque=${(opaque / sampled * 100).toFixed(2)}% distinct=${cols.size} top=${JSON.stringify(top)}`);
}
