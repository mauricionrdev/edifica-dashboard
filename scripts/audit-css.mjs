import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'src');
const baselinePath = path.join(root, 'scripts', 'css-audit-baseline.json');
const cssFiles = [];
const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const json = args.has('--json');

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    if (entry.isFile() && entry.name.endsWith('.css')) cssFiles.push(full);
  }
}

async function readBaseline() {
  try {
    await access(baselinePath);
    return JSON.parse(await readFile(baselinePath, 'utf8'));
  } catch {
    return null;
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

const baseline = await readBaseline();
const payload = { totals, baseline, top: top.slice(0, 12) };

if (json) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log('CSS audit');
  console.table(totals);
  if (baseline) {
    console.log('\nBaseline anti-regressão:');
    console.table({
      rawColors: baseline.rawColors,
      important: baseline.important,
      localTokens: baseline.localTokens,
      radiusAbove10: baseline.radiusAbove10,
    });
  }
  console.log('\nTop arquivos para Fase D:');
  console.table(payload.top);
}

if (strict) {
  if (!baseline) {
    console.error('\nCSS audit strict falhou: scripts/css-audit-baseline.json não encontrado.');
    process.exit(1);
  }

  const checks = [
    ['rawColors', 'cores cruas'],
    ['important', '!important'],
    ['localTokens', 'tokens locais'],
    ['radiusAbove10', 'border-radius acima de 10px'],
  ];

  const regressions = checks
    .filter(([key]) => Number(totals[key]) > Number(baseline[key]))
    .map(([key, label]) => ({
      metric: key,
      label,
      current: totals[key],
      limit: baseline[key],
      excess: totals[key] - baseline[key],
    }));

  if (regressions.length) {
    console.error('\nCSS audit strict falhou. Regressões encontradas:');
    console.table(regressions);
    console.error('Corrija o CSS ou atualize o baseline conscientemente após validação visual.');
    process.exit(1);
  }

  console.log('\nCSS audit strict aprovado. Sem regressão visual estrutural.');
}
