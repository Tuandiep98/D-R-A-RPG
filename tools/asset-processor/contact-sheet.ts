/**
 * Builds a labelled contact sheet of images, for picking icons by eye.
 *   pnpm assets:sheet <out.png> <dir> [cols] [cell]
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const [out, dir, colsArg, cellArg] = process.argv.slice(2);
if (!out || !dir)
  throw new Error("usage: assets:sheet <out.png> <dir> [cols] [cell]");
const cols = Number(colsArg ?? 10);
const cell = Number(cellArg ?? 96);
const label = 16;
const files = readdirSync(dir)
  .filter((f) => /\.(png|webp|jpg)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const rows = Math.ceil(files.length / cols);
const composites = await Promise.all(
  files.flatMap((f, i) => {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * (cell + label);
    const name = f.replace(/\.[^.]+$/, "").replace(/Ability_/, "");
    const text = Buffer.from(
      `<svg width="${cell}" height="${label}"><rect width="100%" height="100%" fill="#111"/><text x="3" y="12" font-size="11" font-family="monospace" fill="#fff">${name}</text></svg>`,
    );
    return [
      sharp(join(dir, f))
        .resize(cell, cell, { fit: "contain", background: "#333" })
        .png()
        .toBuffer()
        .then((input) => ({ input, left: x, top: y })),
      Promise.resolve({ input: text, left: x, top: y + cell }),
    ];
  }),
);
await sharp({
  create: {
    width: cols * cell,
    height: rows * (cell + label),
    channels: 4,
    background: "#222",
  },
})
  .composite(composites)
  .png()
  .toFile(out);
console.log(`${files.length} images → ${out}`);
