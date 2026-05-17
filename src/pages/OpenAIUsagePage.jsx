import { useEffect, useMemo, useState } from 'react';
import { getOpenAIUsageReport, refreshOpenAIUsageReport } from '../api/openaiUsage.js';
import { OPENAI_USAGE_REPORT, currencyUsd, percent } from '../data/openaiUsageReport.js';
import styles from './OpenAIUsagePage.module.css';

const FALLBACK_REPORT = OPENAI_USAGE_REPORT;

function number(value = 0) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function monthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function normalizeReport(raw) {
  const report = raw || FALLBACK_REPORT;
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const zeroDetails = Array.isArray(report.zeroSpendProjectDetails)
    ? report.zeroSpendProjectDetails
    : (Array.isArray(report.zeroSpendProjects) ? report.zeroSpendProjects.map((name) => ({ name, client: name })) : []);

  return {
    ...report,
    organization: report.organization || 'Edifica',
    source: report.source || 'OpenAI Admin API',
    rows,
    zeroSpendProjectDetails: zeroDetails,
    zeroSpendProjects: zeroDetails.map((item) => item.name || item.client || item.projectName).filter(Boolean),
  };
}

function buildPdfHtml(reportInput) {
  const report = normalizeReport(reportInput);
  const rows = [...report.rows].sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0));
  const maxSpend = Math.max(...rows.map((row) => Number(row.spend || 0)), 1);
  const topThreeSpend = rows.slice(0, 3).reduce((sum, row) => sum + Number(row.spend || 0), 0);
  const smallestWithUsage = rows[rows.length - 1];
  const periodLabel = report.period?.label || report.period || 'Período atual';

  const rowsHtml = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${row.name || row.client || row.projectName || row.projectId}</td>
      <td>${currencyUsd(row.spend)}</td>
      <td>${percent(row.shareOfActive)}</td>
      <td>${row.totalTokens ? number(row.totalTokens) : '—'}</td>
      <td>${row.requests ? number(row.requests) : '—'}</td>
    </tr>
  `).join('');

  const chartRows = rows.map((row, index) => `
    <div class="bar-row">
      <div class="bar-label">${row.name || row.client || row.projectName || row.projectId}</div>
      <div class="bar-track">
        <span class="${index < 3 ? 'featured' : ''}" style="width:${Math.max(2, (Number(row.spend || 0) / maxSpend) * 100)}%"></span>
      </div>
      <strong>${currencyUsd(row.spend)}</strong>
    </div>
  `).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${report.title || 'Relatório de Uso por API Key'}</title>
<style>
  @page { size: A4; margin: 15mm 17mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #0f172a; background: #fff; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 11.5px; }
  h1 { margin: 0; font-size: 28px; line-height: 1.05; letter-spacing: -0.045em; }
  h2 { margin: 28px 0 12px; font-size: 16px; letter-spacing: -0.02em; }
  .meta { margin-top: 6px; color: #64748b; font-size: 12.5px; line-height: 1.35; }
  .rule { height: 1px; margin: 18px 0 0; background: #1f2937; opacity: .9; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; }
  .card { min-height: 88px; border: 1px solid #e2e8f0; padding: 12px; }
  .card span { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  .card strong { display: block; margin-top: 18px; font-size: 21px; letter-spacing: -0.035em; }
  .card em { display: block; margin-top: 16px; color: #94a3b8; font-style: normal; }
  .legacy { margin-top: 14px; padding: 14px 18px; border-left: 4px solid #f59e0b; background: #fff7d6; }
  .legacy span { color: #9a3412; font-weight: 800; text-transform: uppercase; }
  .legacy strong { display: block; margin-top: 8px; font-size: 15px; }
  .legacy b { color: #9a3412; font-size: 20px; }
  .hint { margin: -4px 0 16px; color: #94a3b8; font-style: italic; line-height: 1.4; }
  .bars { max-width: 760px; margin: 0 auto; }
  .bar-row { display: grid; grid-template-columns: 190px 1fr 52px; gap: 7px; align-items: center; min-height: 18px; }
  .bar-label { text-align: right; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { height: 11px; background: #ede9fe; overflow: hidden; }
  .bar-track span { display: block; height: 100%; background: #7c3aed; }
  .bar-track span.featured { background: #5b21b6; }
  .bar-row strong { font-size: 10.5px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { padding: 7px 8px; border-bottom: 1px solid #0f172a; background: #f1f5f9; text-align: left; font-size: 10.5px; }
  td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  td:nth-child(1), td:nth-child(3), td:nth-child(4), td:nth-child(5), td:nth-child(6),
  th:nth-child(1), th:nth-child(3), th:nth-child(4), th:nth-child(5), th:nth-child(6) { text-align: right; }
  tbody tr:nth-child(-n+3) td:nth-child(2), tbody tr:nth-child(-n+3) td:nth-child(3) { color: #7c3aed; font-weight: 800; }
  .zero { color: #94a3b8; font-style: italic; }
  .total td { border-top: 1px solid #0f172a; border-bottom: 0; background: #f1f5f9 !important; font-weight: 800; }
  ul { margin: 0; padding-left: 0; list-style: none; display: grid; gap: 7px; }
  li { position: relative; padding-left: 14px; line-height: 1.35; }
  li:before { content: ''; position: absolute; left: 0; top: .48em; width: 7px; height: 7px; border-radius: 50%; background: #7c3aed; }
</style>
</head>
<body>
  <h1>${report.title || 'Relatório de Uso por API Key'}</h1>
  <div class="meta">Organização: <strong>${report.organization}</strong> · Período: <strong>${periodLabel}</strong> · Fonte: ${report.source}</div>
  <div class="rule"></div>

  <h2>Resumo geral</h2>
  <div class="cards">
    <div class="card"><span>Gasto total</span><strong>${currencyUsd(report.totalSpend)}</strong><em>Inclui projeto legado, quando existir</em></div>
    <div class="card"><span>Gasto projetos atuais</span><strong>${currencyUsd(report.activeProjectSpend || report.activeClientSpend)}</strong><em>${report.projectsWithSpend || report.activeClientsWithSpend || 0} projetos com uso</em></div>
    <div class="card"><span>Projetos OpenAI</span><strong>${report.totalProjects || report.activeProjects || 0}</strong><em>${report.zeroSpendCount || report.zeroSpendProjects?.length || 0} sem gasto</em></div>
    <div class="card"><span>Maior gasto</span><strong>${currencyUsd(rows[0]?.spend || 0)}</strong><em>${rows[0]?.name || rows[0]?.client || '—'}</em></div>
  </div>

  ${report.legacyProject ? `<div class="legacy"><span>Projeto legado</span><strong>${report.legacyProject.name || report.legacyProject.projectName} — separado dos projetos atuais</strong><p><b>${currencyUsd(report.legacyProject.spend)}</b> · ${percent(report.legacyProject.percentOfTotal)} do total</p></div>` : ''}

  <h2>Gasto por API Key — visualização</h2>
  <p class="hint">API Keys ordenadas por gasto no período. Os três maiores aparecem destacados. Não exibido: ${report.zeroSpendCount || report.zeroSpendProjects?.length || 0} projetos sem gasto.</p>
  <div class="bars">${chartRows}</div>

  <h2>Detalhamento por API Key</h2>
  <p class="hint">Tabela com as chaves/projetos com consumo no período, ordenadas do maior para o menor gasto.</p>
  <table>
    <thead><tr><th>#</th><th>API Key</th><th>Gasto</th><th>% s/ projetos</th><th>Tokens</th><th>Requisições</th></tr></thead>
    <tbody>${rowsHtml}<tr class="zero"><td>—</td><td>+ ${report.zeroSpendCount || 0} projetos sem gasto no período</td><td>$0.00</td><td>—</td><td>—</td><td>—</td></tr><tr class="total"><td></td><td>Total projetos atuais</td><td>${currencyUsd(report.activeProjectSpend || report.activeClientSpend)}</td><td>100,0%</td><td>${number(report.totalTokens)}</td><td>${number(report.totalRequests)}</td></tr></tbody>
  </table>

  <h2>Principais observações</h2>
  <ul>
    <li><strong>Maior gasto:</strong> ${rows[0]?.name || rows[0]?.client || '—'} — ${currencyUsd(rows[0]?.spend || 0)}.</li>
    <li><strong>Concentração:</strong> os 3 maiores projetos somam ${currencyUsd(topThreeSpend)}.</li>
    <li><strong>Menor gasto com uso:</strong> ${smallestWithUsage?.name || smallestWithUsage?.client || '—'} — ${currencyUsd(smallestWithUsage?.spend || 0)}.</li>
    ${report.legacyProject ? `<li><strong>Legado:</strong> ${report.legacyProject.name || report.legacyProject.projectName} responde por ${currencyUsd(report.legacyProject.spend)}.</li>` : ''}
  </ul>
</body>
</html>`;
}

function downloadHtmlAsPdf(report) {
  const html = buildPdfHtml(report);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      frame.remove();
    }, 1200);
  };
  frame.src = url;
}

export default function OpenAIUsagePage() {
  const defaultRange = useMemo(() => monthRange(), []);
  const [range, setRange] = useState(defaultRange);
  const [report, setReport] = useState(() => normalizeReport(FALLBACK_REPORT));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const rows = useMemo(
    () => [...(report.rows || [])].sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0)),
    [report.rows]
  );

  const maxSpend = Math.max(...rows.map((row) => Number(row.spend || 0)), 1);
  const topThreeSpend = rows.slice(0, 3).reduce((sum, row) => sum + Number(row.spend || 0), 0);
  const smallestWithUsage = rows[rows.length - 1];
  const periodLabel = report.period?.label || `${range.start} até ${range.end}`;

  async function loadReport({ force = false, silent = false } = {}) {
    if (!silent) setLoading(true);
    setError('');

    try {
      const response = force
        ? await refreshOpenAIUsageReport(range)
        : await getOpenAIUsageReport({ ...range, force });
      setReport(normalizeReport(response.report));
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar dados OpenAI.');
      if (!report?.rows?.length) setReport(normalizeReport(FALLBACK_REPORT));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadReport({ force: true, silent: true });
  }

  return (
    <main className={styles.page}>
      <section className={styles.report}>
        <header className={styles.header}>
          <div>
            <h1>{report.title || 'Relatório de Uso por API Key'}</h1>
            <p>Organização: <strong>{report.organization}</strong> · Período: <strong>{periodLabel}</strong> · Fonte: {report.source}</p>
          </div>
          <div className={styles.actions}>
            <label>
              <span>Início</span>
              <input type="date" value={range.start} onChange={(event) => setRange((prev) => ({ ...prev, start: event.target.value }))} />
            </label>
            <label>
              <span>Fim</span>
              <input type="date" value={range.end} onChange={(event) => setRange((prev) => ({ ...prev, end: event.target.value }))} />
            </label>
            <button type="button" onClick={handleRefresh} disabled={refreshing || loading}>
              {refreshing ? 'Atualizando' : 'Atualizar agora'}
            </button>
            <button type="button" onClick={() => downloadHtmlAsPdf(report)}>Baixar PDF</button>
          </div>
        </header>

        {error ? <div className={styles.alert}>{error}</div> : null}
        {report.cached ? <div className={styles.cacheInfo}>Última atualização: {report.lastUpdatedAt ? new Date(report.lastUpdatedAt).toLocaleString('pt-BR') : 'cache recente'}</div> : null}
        {report.reconciliation ? (
          <div className={styles.reconciliationInfo}>
            <span>Total OpenAI: <strong>{currencyUsd(report.reconciliation.costsTotalFromOpenAI)}</strong></span>
            <span>Agrupado por projeto: <strong>{currencyUsd(report.reconciliation.costsGroupedByProject)}</strong></span>
            {Number(report.reconciliation.difference || 0) > 0 ? <span>Não classificado: <strong>{currencyUsd(report.reconciliation.difference)}</strong></span> : null}
          </div>
        ) : null}

        <section className={styles.section}>
          <h2>Resumo geral</h2>
          <div className={`${styles.summaryGrid} ${loading ? styles.loading : ''}`.trim()}>
            <article>
              <span>Gasto total</span>
              <strong>{currencyUsd(report.totalSpend)}</strong>
              <em>Inclui projeto legado, quando existir</em>
            </article>
            <article>
              <span>Gasto projetos atuais</span>
              <strong>{currencyUsd(report.activeProjectSpend || report.activeClientSpend)}</strong>
              <em>{report.projectsWithSpend || report.activeClientsWithSpend || 0} projetos com uso</em>
            </article>
            <article>
              <span>Projetos OpenAI</span>
              <strong>{report.totalProjects || report.activeProjects || 0}</strong>
              <em>{report.zeroSpendCount || report.zeroSpendProjects?.length || 0} sem gasto</em>
            </article>
            <article>
              <span>Maior gasto</span>
              <strong>{currencyUsd(rows[0]?.spend || 0)}</strong>
              <em>{rows[0]?.name || rows[0]?.client || '—'}</em>
            </article>
          </div>

          {report.legacyProject ? (
            <aside className={styles.legacy}>
              <div>
                <span>Projeto legado</span>
                <strong>{report.legacyProject.name || report.legacyProject.projectName} — separado dos projetos atuais</strong>
                <p>{currencyUsd(report.legacyProject.spend)} · {percent(report.legacyProject.percentOfTotal)} do total</p>
              </div>
            </aside>
          ) : null}
        </section>

        <section className={styles.section}>
          <h2>Gasto por API Key — visualização</h2>
          <p className={styles.hint}>API Keys ordenadas por gasto no período. Os três maiores aparecem destacados. Não exibido: {report.zeroSpendCount || report.zeroSpendProjects?.length || 0} projetos sem gasto.</p>

          <div className={styles.chart}>
            {rows.map((row, index) => (
              <div key={row.projectId || row.name || row.client} className={styles.chartRow}>
                <strong>{row.name || row.client || row.projectName || row.projectId}</strong>
                <div className={styles.track}>
                  <span className={index < 3 ? styles.featuredBar : ''} style={{ width: `${Math.max(2, (Number(row.spend || 0) / maxSpend) * 100)}%` }} />
                </div>
                <em>{currencyUsd(row.spend)}</em>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2>Detalhamento por API Key</h2>
          <p className={styles.hint}>Tabela com as chaves/projetos com consumo no período, ordenadas do maior para o menor gasto.</p>

          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>API Key</th>
                  <th>Gasto</th>
                  <th>% s/ projetos</th>
                  <th>Tokens</th>
                  <th>Requisições</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.projectId || row.name || row.client}>
                    <td>{index + 1}</td>
                    <td><strong>{row.name || row.client || row.projectName || row.projectId}</strong></td>
                    <td>{currencyUsd(row.spend)}</td>
                    <td>{percent(row.shareOfActive)}</td>
                    <td>{row.totalTokens ? number(row.totalTokens) : '—'}</td>
                    <td>{row.requests ? number(row.requests) : '—'}</td>
                  </tr>
                ))}
                <tr className={styles.zeroRow}>
                  <td>—</td>
                  <td>+ {report.zeroSpendCount || 0} projetos sem gasto no período</td>
                  <td>$0.00</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
                <tr className={styles.totalRow}>
                  <td />
                  <td>Total projetos atuais</td>
                  <td>{currencyUsd(report.activeProjectSpend || report.activeClientSpend)}</td>
                  <td>100,0%</td>
                  <td>{report.totalTokens ? number(report.totalTokens) : '—'}</td>
                  <td>{report.totalRequests ? number(report.totalRequests) : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {Array.isArray(report.zeroSpendProjectDetails) && report.zeroSpendProjectDetails.length ? (
            <div className={styles.zeroProjects}>
              <strong>Sem gasto no período</strong>
              <span>{report.zeroSpendProjectDetails.map((item) => item.name || item.client || item.projectName).filter(Boolean).join(', ')}</span>
            </div>
          ) : null}
        </section>

        <section className={styles.section}>
          <h2>Principais observações</h2>
          <ul className={styles.observations}>
            <li><strong>Maior gasto:</strong> {rows[0]?.name || rows[0]?.client || '—'} — {currencyUsd(rows[0]?.spend || 0)}.</li>
            <li><strong>Concentração:</strong> os 3 maiores projetos somam {currencyUsd(topThreeSpend)}.</li>
            <li><strong>Menor gasto com uso:</strong> {smallestWithUsage?.name || smallestWithUsage?.client || '—'} — {currencyUsd(smallestWithUsage?.spend || 0)}.</li>
            {report.legacyProject ? (
              <li><strong>Legado:</strong> {report.legacyProject.name || report.legacyProject.projectName} responde por {currencyUsd(report.legacyProject.spend)}.</li>
            ) : null}
          </ul>
        </section>
      </section>
    </main>
  );
}
