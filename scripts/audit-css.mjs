import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'src');
const cssFiles = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    if (entry.isFile() && entry.name.endsWith('.css')) cssFiles.push(full);
  }
}

await walk(src);

const rawColor = /(?<![\w-])(?:#[0-9a-fA-F]{3,8}|rgba?\([^\)]*\)|hsla?\([^\)]*\))/g;
const important = /!important/g;
const localToken = /--(?:edf|sidebar|profile|dash|client|project|modal|task)-[\w-]+\s*:/g;
const giantRadius = /border-radius\s*:\s*(?:1[1-9]|[2-9]\d)px/g;

const totals = {
  files: cssFiles.length,
  rawColors: 0,
  important: 0,
  localTokens: 0,
  radiusAbove10: 0,
};

const top = [];
for (const file of cssFiles) {
  const text = await readFile(file, 'utf8');
  const stats = {
    file: path.relative(root, file),
    rawColors: (text.match(rawColor) || []).length,
    important: (text.match(important) || []).length,
    localTokens: (text.match(localToken) || []).length,
    radiusAbove10: (text.match(giantRadius) || []).length,
  };
  totals.rawColors += stats.rawColors;
  totals.important += stats.important;
  totals.localTokens += stats.localTokens;
  totals.radiusAbove10 += stats.radiusAbove10;
  const score = stats.rawColors + stats.important * 3 + stats.localTokens * 2 + stats.radiusAbove10 * 2;
  if (score) top.push({ ...stats, score });
}

top.sort((a, b) => b.score - a.score);
console.log('CSS audit');
console.table(totals);
console.log('\nTop arquivos para Fase D:');
console.table(top.slice(0, 12));
