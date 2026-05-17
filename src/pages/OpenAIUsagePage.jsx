import { useMemo } from 'react';
import { OPENAI_USAGE_REPORT, currencyUsd, percent } from '../data/openaiUsageReport.js';
import styles from './OpenAIUsagePage.module.css';

const REPORT = OPENAI_USAGE_REPORT;

function buildPdfHtml() {
  const rows = REPORT.rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${row.client}</td>
      <td>${currencyUsd(row.spend)}</td>
      <td>${percent(row.shareOfActive)}</td>
    </tr>
  `).join('');

  const maxSpend = Math.max(...REPORT.rows.map((row) => row.spend), 1);
  const chartRows = REPORT.rows.map((row, index) => `
    <div class="bar-row">
      <div class="bar-label">${row.client}</div>
      <div class="bar-track">
        <span class="${index < 3 ? 'featured' : ''}" style="width:${Math.max(2, (row.spend / maxSpend) * 100)}%"></span>
      </div>
      <strong>${currencyUsd(row.spend)}</strong>
    </div>
  `).join('');

  const topThreeSpend = REPORT.rows.slice(0, 3).reduce((sum, row) => sum + row.spend, 0);
  const smallestWithUsage = REPORT.rows[REPORT.rows.length - 1];

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${REPORT.title}</title>
<style>
  @page { size: A4; margin: 15mm 17mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #0f172a;
    background: #fff;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11.5px;
  }
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
  td:nth-child(1), td:nth-child(3), td:nth-child(4),
  th:nth-child(1), th:nth-child(3), th:nth-child(4) { text-align: right; }
  tbody tr:nth-child(-n+3) td:nth-child(2),
  tbody tr:nth-child(-n+3) td:nth-child(3) { color: #7c3aed; font-weight: 800; }
  .zero { color: #94a3b8; font-style: italic; }
  .total td { border-top: 1px solid #0f172a; border-bottom: 0; background: #f1f5f9 !important; font-weight: 800; }
  ul { margin: 0; padding-left: 0; list-style: none; display: grid; gap: 7px; }
  li { position: relative; padding-left: 14px; line-height: 1.35; }
  li:before { content: ''; position: absolute; left: 0; top: .48em; width: 7px; height: 7px; border-radius: 50%; background: #7c3aed; }
</style>
</head>
<body>
  <h1>${REPORT.title}</h1>
  <div class="meta">Organização: <strong>${REPORT.organization}</strong> · Período: <strong>maio de 2026</strong> (gasto mensal acumulado) · Fonte: ${REPORT.source}</div>
  <div class="rule"></div>

  <h2>Resumo geral</h2>
  <div class="cards">
    <div class="card"><span>Gasto total (mês)</span><strong>${currencyUsd(REPORT.totalSpend)}</strong><em>Inclui projeto legado</em></div>
    <div class="card"><span>Gasto clientes ativos</span><strong>${currencyUsd(REPORT.activeClientSpend)}</strong><em>${REPORT.activeClientsWithSpend} clientes com uso</em></div>
    <div class="card"><span>Projetos ativos</span><strong>${REPORT.activeProjects}</strong><em>${REPORT.zeroSpendProjects.length} sem gasto no mês</em></div>
    <div class="card"><span>Maior gasto individual</span><strong>${currencyUsd(REPORT.rows[0].spend)}</strong><em>${REPORT.rows[0].client}</em></div>
  </div>

  <div class="legacy">
    <span>Projeto legado</span>
    <strong>${REPORT.legacyProject.name} — chaves antigas desativadas, substituídas pelos projetos atuais</strong>
    <p><b>${currencyUsd(REPORT.legacyProject.spend)}</b> · ${percent(REPORT.legacyProject.percentOfTotal)} do total do mês</p>
  </div>

  <h2>Gasto por API Key — visualização</h2>
  <p class="hint">Clientes ativos ordenados por gasto no mês. Os três maiores aparecem destacados. Não exibido: ${REPORT.zeroSpendProjects.length} projetos sem gasto no período.</p>
  <div class="bars">${chartRows}</div>

  <h2>Detalhamento por API Key — clientes ativos</h2>
  <p class="hint">Tabela com todos os projetos atuais que tiveram consumo no mês, ordenados do maior para o menor gasto. Projetos provisionados sem consumo estão agrupados na última linha.</p>
  <table>
    <thead><tr><th>#</th><th>API Key / Cliente</th><th>Gasto mensal (USD)</th><th>% s/ ativos</th></tr></thead>
    <tbody>${rows}<tr class="zero"><td>—</td><td>+ ${REPORT.zeroSpendProjects.length} projetos sem gasto no mês: ${REPORT.zeroSpendProjects.join(', ')}</td><td>$0,00</td><td>—</td></tr><tr class="total"><td></td><td>Total clientes ativos</td><td>${currencyUsd(REPORT.activeClientSpend)}</td><td>100,0%</td></tr></tbody>
  </table>

  <h2>Principais observações</h2>
  <ul>
    <li><strong>Maior gasto:</strong> ${REPORT.rows[0].client} — ${currencyUsd(REPORT.rows[0].spend)} (${percent(REPORT.rows[0].shareOfActive)} dos clientes ativos).</li>
    <li><strong>Concentração:</strong> os 3 maiores clientes (${REPORT.rows.slice(0, 3).map((row) => row.client).join(', ')}) somam ${currencyUsd(topThreeSpend)} — ${percent(35.3)} do gasto entre clientes ativos.</li>
    <li><strong>Menor gasto com uso:</strong> ${smallestWithUsage.client} — ${currencyUsd(smallestWithUsage.spend)}. Há ${REPORT.zeroSpendProjects.length} projetos sem gasto no mês.</li>
    <li><strong>Legado:</strong> o ${REPORT.legacyProject.name} responde por ${currencyUsd(REPORT.legacyProject.spend)} (${percent(REPORT.legacyProject.percentOfTotal)} do total) e refere-se a chaves antigas já desativadas.</li>
  </ul>
</body>
</html>`;
}

function downloadHtmlAsPdf() {
  const html = buildPdfHtml();
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
  const rows = useMemo(() => [...REPORT.rows].sort((a, b) => b.spend - a.spend), []);
  const maxSpend = Math.max(...rows.map((row) => row.spend), 1);
  const topThreeSpend = rows.slice(0, 3).reduce((sum, row) => sum + row.spend, 0);
  const smallestWithUsage = rows[rows.length - 1];

  return (
    <main className={styles.page}>
      <section className={styles.report}>
        <header className={styles.header}>
          <div>
            <h1>{REPORT.title}</h1>
            <p>Organização: <strong>{REPORT.organization}</strong> · Período: <strong>maio de 2026</strong> (gasto mensal acumulado) · Fonte: {REPORT.source}</p>
          </div>
          <button type="button" onClick={downloadHtmlAsPdf}>Baixar PDF</button>
        </header>

        <section className={styles.section}>
          <h2>Resumo geral</h2>
          <div className={styles.summaryGrid}>
            <article>
              <span>Gasto total (mês)</span>
              <strong>{currencyUsd(REPORT.totalSpend)}</strong>
              <em>Inclui projeto legado</em>
            </article>
            <article>
              <span>Gasto clientes ativos</span>
              <strong>{currencyUsd(REPORT.activeClientSpend)}</strong>
              <em>{REPORT.activeClientsWithSpend} clientes com uso</em>
            </article>
            <article>
              <span>Projetos ativos</span>
              <strong>{REPORT.activeProjects}</strong>
              <em>{REPORT.zeroSpendProjects.length} sem gasto no mês</em>
            </article>
            <article>
              <span>Maior gasto individual</span>
              <strong>{currencyUsd(rows[0].spend)}</strong>
              <em>{rows[0].client}</em>
            </article>
          </div>

          <aside className={styles.legacy}>
            <div>
              <span>Projeto legado</span>
              <strong>{REPORT.legacyProject.name} — chaves antigas desativadas, substituídas pelos projetos atuais</strong>
              <p>{currencyUsd(REPORT.legacyProject.spend)} · {percent(REPORT.legacyProject.percentOfTotal)} do total do mês</p>
            </div>
          </aside>
        </section>

        <section className={styles.section}>
          <h2>Gasto por API Key — visualização</h2>
          <p className={styles.hint}>Clientes ativos ordenados por gasto no mês. Os três maiores aparecem destacados. Não exibido: {REPORT.zeroSpendProjects.length} projetos sem gasto no período.</p>

          <div className={styles.chart}>
            {rows.map((row, index) => (
              <div key={row.client} className={styles.chartRow}>
                <strong>{row.client}</strong>
                <div className={styles.track}>
                  <span className={index < 3 ? styles.featuredBar : ''} style={{ width: `${Math.max(2, (row.spend / maxSpend) * 100)}%` }} />
                </div>
                <em>{currencyUsd(row.spend)}</em>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2>Detalhamento por API Key — clientes ativos</h2>
          <p className={styles.hint}>Tabela com todos os projetos atuais que tiveram consumo no mês, ordenados do maior para o menor gasto. Projetos provisionados sem consumo estão agrupados na última linha.</p>

          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>API Key / Cliente</th>
                  <th>Gasto mensal (USD)</th>
                  <th>% s/ ativos</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.client}>
                    <td>{index + 1}</td>
                    <td><strong>{row.client}</strong></td>
                    <td>{currencyUsd(row.spend)}</td>
                    <td>{percent(row.shareOfActive)}</td>
                  </tr>
                ))}
                <tr className={styles.zeroRow}>
                  <td>—</td>
                  <td>+ {REPORT.zeroSpendProjects.length} projetos sem gasto no mês: {REPORT.zeroSpendProjects.join(', ')}</td>
                  <td>$0,00</td>
                  <td>—</td>
                </tr>
                <tr className={styles.totalRow}>
                  <td />
                  <td>Total clientes ativos</td>
                  <td>{currencyUsd(REPORT.activeClientSpend)}</td>
                  <td>100,0%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Principais observações</h2>
          <ul className={styles.observations}>
            <li><strong>Maior gasto:</strong> {rows[0].client} — {currencyUsd(rows[0].spend)} ({percent(rows[0].shareOfActive)} dos clientes ativos).</li>
            <li><strong>Concentração:</strong> os 3 maiores clientes ({rows.slice(0, 3).map((row) => row.client).join(', ')}) somam {currencyUsd(topThreeSpend)} — {percent(35.3)} do gasto entre clientes ativos.</li>
            <li><strong>Menor gasto com uso:</strong> {smallestWithUsage.client} — {currencyUsd(smallestWithUsage.spend)}. Há {REPORT.zeroSpendProjects.length} projetos sem gasto no mês.</li>
            <li><strong>Legado:</strong> o {REPORT.legacyProject.name} responde por {currencyUsd(REPORT.legacyProject.spend)} ({percent(REPORT.legacyProject.percentOfTotal)} do total) e refere-se a chaves antigas já desativadas.</li>
          </ul>
        </section>
      </section>
    </main>
  );
}
