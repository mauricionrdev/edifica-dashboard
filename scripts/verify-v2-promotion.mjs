import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const errors = [];
const warnings = [];

const allowedFlags = [
  'VITE_PROMOTE_CLIENTES_V2',
  'VITE_PROMOTE_GESTAO_TRAFEGO_V2',
  'VITE_PROMOTE_MODELO_OFICIAL_V2',
  'VITE_PROMOTE_PERFIL_V2',
  'VITE_PROMOTE_EQUIPE_V2',
  'VITE_PROMOTE_PROJETOS_V2',
];

const blockedFlagFragments = [
  'DASHBOARD',
  'RANKING',
  'RANKINGS',
  'RETENCAO',
  'RETENTION',
  'SEMANA',
  'WEEKLY',
  'SQUAD',
  'SQUADS',
  'GDV',
  'GDVS',
  'WORKSPACE',
  'SUPORTE',
  'SUPPORT',
];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

function extractFlags(source) {
  return [...source.matchAll(/VITE_PROMOTE_[A-Z0-9_]+/g)].map((match) => match[0]);
}

const app = read('src/App.jsx');
const flagsSource = read('src/pages/v2/v2PromotionFlags.js');
const registrySource = read('src/pages/v2/v2RouteRegistry.js');

const allFlagMentions = new Set([
  ...extractFlags(flagsSource),
  ...extractFlags(registrySource),
  ...extractFlags(app),
]);

for (const flag of allFlagMentions) {
  assert(allowedFlags.includes(flag), `Flag não autorizada encontrada no código: ${flag}`);
  assert(!blockedFlagFragments.some((fragment) => flag.includes(fragment)), `Flag crítica bloqueada encontrada: ${flag}`);
}

for (const flag of allowedFlags) {
  assert(flagsSource.includes(flag), `Flag permitida ausente em v2PromotionFlags.js: ${flag}`);
}

const expectedPromotions = [
  ['clients', 'legacy/clientes'],
  ['traffic', 'legacy/gestao-trafego'],
  ['model', 'legacy/modelo-oficial'],
  ['profile', 'legacy/perfil'],
  ['team', 'legacy/equipe'],
  ['projects', 'legacy/projetos'],
];

for (const [key, legacyRoute] of expectedPromotions) {
  assert(app.includes(`isV2RoutePromoted('${key}')`), `Rota oficial não usa flag de promoção: ${key}`);
  assert(app.includes(`path="${legacyRoute}"`), `Fallback legacy ausente: /${legacyRoute}`);
}

for (const locked of ['dashboard', 'weekly', 'squads', 'rankings', 'gdvs', 'retention', 'workspace', 'support']) {
  const keyNeedle = `key: '${locked}'`;
  const keyIndex = registrySource.indexOf(keyNeedle);
  assert(keyIndex >= 0, `Rota bloqueada não encontrada no registry: ${locked}`);
  if (keyIndex >= 0) {
    const routeEnd = registrySource.indexOf('\n  },', keyIndex);
    const routeBlock = registrySource.slice(keyIndex, routeEnd >= 0 ? routeEnd : undefined);
    assert(!routeBlock.includes('flagKey'), `Rota crítica não pode ter flagKey: ${locked}`);
  }
}


for (const envFile of ['.env.example', '.env.production.example']) {
  const source = read(envFile);
  for (const flag of allowedFlags) {
    assert(source.includes(`${flag}=false`), `${envFile} deve manter ${flag}=false por padrão`);
  }

  for (const flag of extractFlags(source)) {
    assert(allowedFlags.includes(flag), `${envFile} contém flag não permitida: ${flag}`);
  }
}

warn(app.includes('<Route path="v2" element={<Navigate to="/v2/visao-geral" replace />} />'), 'Redirect base /v2 não foi encontrado.');
warn(app.includes('path="v2/promocao"'), 'Rota /v2/promocao não foi encontrada.');
warn(app.includes('path="v2/validacao"'), 'Rota /v2/validacao não foi encontrada.');

if (warnings.length) {
  console.warn('\nAvisos de verificação V2:');
  for (const item of warnings) console.warn(`- ${item}`);
}

if (errors.length) {
  console.error('\nFalha na verificação de promoção V2:');
  for (const item of errors) console.error(`- ${item}`);
  process.exit(1);
}

console.log('Verificação de promoção V2 aprovada.');
