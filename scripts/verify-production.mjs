#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();

function fail(message) {
  console.error(`✖ ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function walk(dir, matcher, acc = []) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return acc;
  for (const entry of readdirSync(abs)) {
    const full = join(abs, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      walk(relative(root, full), matcher, acc);
    } else if (matcher(full)) {
      acc.push(relative(root, full));
    }
  }
  return acc;
}

function runNodeCheck(rel) {
  if (!existsSync(join(root, rel))) return;
  const result = spawnSync(process.execPath, ['--check', rel], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fail(`node --check falhou em ${rel}\n${result.stderr || result.stdout}`);
  } else {
    ok(`node --check ${rel}`);
  }
}

const requiredFiles = [
  'src/pages/PreencherSemanaPage.jsx',
  'src/pages/PreencherSemanaPage.module.css',
  'src/api/metrics.js',
  'edifica-api/src/routes/metrics.js',
  'edifica-api/migrations/015_metric_campaigns.sql',
  'src/styles/chassis.css',
];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) fail(`Arquivo obrigatório ausente: ${file}`);
}
if (!process.exitCode) ok('arquivos obrigatórios encontrados');

const preencher = read('src/pages/PreencherSemanaPage.jsx');

const forbiddenPreencher = [
  ['localStorage', 'Preencher Semana não pode usar localStorage em fluxo operacional'],
  ['listMetricPresence', 'presença/polling não deve existir em Preencher Semana'],
  ['touchMetricPresence', 'heartbeat de presença não deve existir em Preencher Semana'],
  ['clearMetricPresence', 'limpeza de presença não deve existir em Preencher Semana'],
  ['setInterval(', 'polling por setInterval não deve existir em Preencher Semana'],
];

for (const [needle, message] of forbiddenPreencher) {
  if (preencher.includes(needle)) fail(message);
}
if (!process.exitCode) ok('Preencher Semana sem localStorage, presença ou polling');

for (const required of ['createMetricCampaign', 'deleteMetricCampaign', 'listMetricCampaigns']) {
  if (!preencher.includes(required)) fail(`Preencher Semana não referencia ${required}`);
}
if (!process.exitCode) ok('campanhas de Preencher Semana usam API');

if (!/payload\[key\]\s*=\s*null/.test(preencher)) {
  fail('campos vazios precisam enviar null para limpar valores no backend');
} else {
  ok('campos vazios enviam null');
}

const metricsApi = read('src/api/metrics.js');
for (const endpoint of ['/metrics/campaigns', 'createMetricCampaign', 'deleteMetricCampaign', 'listMetricCampaigns']) {
  if (!metricsApi.includes(endpoint)) fail(`src/api/metrics.js sem ${endpoint}`);
}
if (!process.exitCode) ok('cliente de API de campanhas configurado');

const backend = read('edifica-api/src/routes/metrics.js');
for (const fragment of ["router.get('/campaigns'", "router.post('/campaigns'", "router.delete('/campaigns/:campaignId'"]) {
  if (!backend.includes(fragment)) fail(`backend sem endpoint ${fragment}`);
}
if (!backend.includes('if (value === null) delete merged[key];')) {
  fail('backend não remove campos com null do JSON de métricas');
}
if (!process.exitCode) ok('backend de campanhas e limpeza de campos validado');

const migration = read('edifica-api/migrations/015_metric_campaigns.sql');
for (const fragment of ['CREATE TABLE IF NOT EXISTS metric_campaigns', 'ALTER TABLE weekly_metrics', 'metric_period_key']) {
  if (!migration.includes(fragment)) fail(`migration 015 incompleta: ${fragment}`);
}
if (!process.exitCode) ok('migration de campanhas encontrada');

const cssFiles = walk('src', (full) => full.endsWith('.css'));
const overlayIssues = [];
for (const rel of cssFiles) {
  const css = read(rel);
  const hasOverlayClass = /\.(overlay|modalOverlay|settingsOverlay|drawerOverlay|campaignModalOverlay|viewerOverlay|attachmentViewerOverlay|taskModalOverlay)\b/.test(css);
  const hasBackdropNone = /backdrop-filter\s*:\s*none/.test(css);
  if (hasOverlayClass && hasBackdropNone && !css.includes('v95 · Backdrop blur restaurado') && !css.includes('v96 · Modal Nova demanda')) {
    overlayIssues.push(rel);
  }
}
if (overlayIssues.length) {
  fail(`overlays com backdrop-filter none sem correção global:\n${overlayIssues.join('\n')}`);
} else {
  ok('overlays principais preservam blur global');
}

const chassis = read('src/styles/chassis.css');
if (!chassis.includes('--chassis-modal-blur')) fail('token --chassis-modal-blur ausente');
if (!chassis.includes('--chassis-modal-backdrop')) fail('token --chassis-modal-backdrop ausente');
if (!process.exitCode) ok('tokens globais de modal existem');

const theme = existsSync(join(root, 'src/styles/theme.css')) ? read('src/styles/theme.css') : '';
const tokens = existsSync(join(root, 'src/styles/tokens.css')) ? read('src/styles/tokens.css') : '';
if ((theme + tokens).includes('--focus-ring:') && !/(--focus-ring\s*:\s*none\s*;)/.test(theme + tokens)) {
  fail('focus-ring visual ainda está ativo');
} else {
  ok('focus-ring visual não está ativo');
}

runNodeCheck('edifica-api/src/routes/metrics.js');
runNodeCheck('edifica-api/server.js');

if (process.exitCode) {
  console.error('\nVerificação de produção falhou.');
  process.exit(process.exitCode);
}

console.log('\nVerificação de produção aprovada.');
