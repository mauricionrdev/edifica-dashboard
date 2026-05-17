import { useMemo } from 'react';
import { OPENAI_USAGE_REPORT, currencyUsd, percent } from '../data/openaiUsageReport.js';
import styles from './OpenAIUsagePage.module.css';

const REPORT = OPENAI_USAGE_REPORT;

function rankTone(index) {
  if (index === 0) return styles.rankGold;
  if (index === 1) return styles.rankSilver;
  if (index === 2) return styles.rankBronze;
  return '';
}

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
  const chartRows = REPORT.rows.slice(0, 12).map((row, index) => `
    <div class="bar-row">
      <div class="bar-label">${index + 1}. ${row.client}</div>
      <div class="bar-track">
        <span style="width:${Math.max(3, (row.spend / maxSpend) * 100)}%"></span>
      </div>
      <strong>${currencyUsd(row.spend)}</strong>
    </div>
  `).join('');

  const observations = [
    `Maior gasto: ${REPORT.rows[0].client} — ${currencyUsd(REPORT.rows[0].spend)} (${percent(REPORT.rows[0].shareOfActive)} dos clientes ativos).`,
    `Top 3 somam ${currencyUsd(REPORT.rows.slice(0, 3).reduce((sum, row) => sum + row.spend, 0))} — ${percent(35.3)} do gasto entre clientes ativos.`,
    `Menor gasto com uso: ${REPORT.rows[REPORT.rows.length - 1].client} — ${currencyUsd(REPORT.rows[REPORT.rows.length - 1].spend)}. ${REPORT.zeroSpendProjects.length} projetos sem gasto no mês.`,
  ];

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${REPORT.title}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #ffffff;
    color: #111318;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 12px;
  }
  .cover {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    padding-bottom: 18px;
    border-bottom: 1px solid #d8dde6;
  }
  h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: -0.04em; }
  .meta { color: #667085; font-size: 12px; line-height: 1.55; }
  .pill { border: 1px solid #d8dde6; border-radius: 999px; padding: 7px 11px; height: max-content; color: #344054; font-weight: 700; }
  .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
  .metric { border: 1px solid #d8dde6; border-radius: 12px; padding: 12px; background: #f8fafc; }
  .metric span { display: block; color: #667085; font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .metric strong { display: block; margin-top: 6px; font-size: 20px; letter-spacing: -0.03em; }
  .legacy { border: 1px solid #f5c542; background: #fff9e6; border-radius: 12px; padding: 12px; margin-bottom: 18px; }
  .section-title { margin: 20px 0 8px; font-size: 14px; font-weight: 800; }
  .bars { border: 1px solid #d8dde6; border-radius: 12px; padding: 12px; }
  .bar-row { display: grid; grid-template-columns: 165px 1fr 58px; gap: 10px; align-items: center; margin: 7px 0; }
  .bar-label { color: #344054; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { height: 9px; border-radius: 999px; background: #eef2f6; overflow: hidden; }
  .bar-track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #111318, #f5b800); }
  .bar-row strong { text-align: right; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { color: #667085; font-size: 9px; letter-spacing: .08em; text-transform: uppercase; text-align: left; border-bottom: 1px solid #d8dde6; padding: 8px; }
  td { border-bottom: 1px solid #edf1f5; padding: 8px; }
  td:nth-child(1), td:nth-child(3), td:nth-child(4), th:nth-child(1), th:nth-child(3), th:nth-child(4) { text-align: right; }
  .observations { display: grid; gap: 8px; margin-top: 10px; }
  .observations div { border: 1px solid #d8dde6; border-radius: 10px; padding: 10px; background: #f8fafc; }
</style>
</head>
<body>
  <div class="cover">
    <div>
      <h1>${REPORT.title}</h1>
      <div class="meta">Organização: ${REPORT.organization}<br/>Período: ${REPORT.period}<br/>Fonte: ${REPORT.source}</div>
    </div>
    <div class="pill">Relatório executivo</div>
  </div>

  <div class="metrics">
    <div class="metric"><span>Gasto total</span><strong>${currencyUsd(REPORT.totalSpend)}</strong></div>
    <div class="metric"><span>Gasto clientes</span><strong>${currencyUsd(REPORT.activeClientSpend)}</strong></div>
    <div class="metric"><span>Projetos ativos</span><strong>${REPORT.activeProjects}</strong></div>
    <div class="metric"><span>API Keys com uso</span><strong>${REPORT.activeClientsWithSpend}</strong></div>
  </div>

  <div class="legacy"><strong>Projeto legado:</strong> ${REPORT.legacyProject.name} — ${currencyUsd(REPORT.legacyProject.spend)} (${percent(REPORT.legacyProject.percentOfTotal)} do total). ${REPORT.legacyProject.note}.</div>

  <div class="section-title">Gasto por API Key</div>
  <div class="bars">${chartRows}</div>

  <div class="section-title">Ranking por gasto</div>
  <table>
    <thead><tr><th>#</th><th>API Key / Cliente</th><th>Gasto</th><th>% s/ ativos</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="section-title">Principais observações</div>
  <div class="observations">${observations.map((item) => `<div>${item}</div>`).join('')}</div>
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
  const rows = useMemo(
    () => [...REPORT.rows].sort((a, b) => b.spend - a.spend),
    []
  );
  const maxSpend = Math.max(...rows.map((row) => row.spend), 1);
  const topThreeSpend = rows.slice(0, 3).reduce((sum, row) => sum + row.spend, 0);
  const smallestWithUsage = rows[rows.length - 1];

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>OpenAI · Edifica</span>
          <h1>{REPORT.title}</h1>
          <p>{REPORT.period} · {REPORT.source}</p>
        </div>

        <div className={styles.heroActions}>
          <button type="button" onClick={downloadHtmlAsPdf}>Baixar PDF</button>
        </div>
      </section>

      <section className={styles.summaryGrid} aria-label="Resumo geral">
        <article className={styles.summaryCard}>
          <span>Gasto total</span>
          <strong>{currencyUsd(REPORT.totalSpend)}</strong>
          <em>Inclui projeto legado</em>
        </article>
        <article className={styles.summaryCard}>
          <span>Gasto clientes</span>
          <strong>{currencyUsd(REPORT.activeClientSpend)}</strong>
          <em>{REPORT.activeClientsWithSpend} clientes com uso</em>
        </article>
        <article className={styles.summaryCard}>
          <span>Projetos ativos</span>
          <strong>{REPORT.activeProjects}</strong>
          <em>{REPORT.zeroSpendProjects.length} sem gasto no mês</em>
        </article>
        <article className={styles.summaryCard}>
          <span>Maior gasto</span>
          <strong>{currencyUsd(rows[0].spend)}</strong>
          <em>{rows[0].client}</em>
        </article>
      </section>

      <section className={styles.legacyCard}>
        <div>
          <span>Projeto legado</span>
          <strong>{REPORT.legacyProject.name}</strong>
          <p>{REPORT.legacyProject.note}</p>
        </div>
        <div className={styles.legacyValue}>
          <strong>{currencyUsd(REPORT.legacyProject.spend)}</strong>
          <span>{percent(REPORT.legacyProject.percentOfTotal)} do total</span>
        </div>
      </section>

      <section className={styles.contentGrid}>
        <article className={styles.chartCard}>
          <header className={styles.sectionHeader}>
            <div>
              <h2>Gasto por API Key</h2>
              <p>Ordenado do maior para o menor gasto no período.</p>
            </div>
          </header>

          <div className={styles.chartList}>
            {rows.map((row, index) => {
              const width = Math.max(2, (row.spend / maxSpend) * 100);
              return (
                <div key={row.client} className={`${styles.chartRow} ${index < 3 ? styles.chartRowFeatured : ''}`.trim()}>
                  <div className={styles.chartLabel}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{row.client}</strong>
                  </div>
                  <div className={styles.chartTrack}>
                    <i style={{ width: `${width}%` }} />
                  </div>
                  <em>{currencyUsd(row.spend)}</em>
                </div>
              );
            })}
          </div>
        </article>

        <aside className={styles.insightsCard}>
          <header className={styles.sectionHeader}>
            <div>
              <h2>Principais observações</h2>
            </div>
          </header>
          <div className={styles.insightList}>
            <article>
              <span>Maior gasto</span>
              <strong>{rows[0].client}</strong>
              <p>{currencyUsd(rows[0].spend)} · {percent(rows[0].shareOfActive)} dos clientes ativos</p>
            </article>
            <article>
              <span>Concentração</span>
              <strong>Top 3</strong>
              <p>{currencyUsd(topThreeSpend)} · {percent(35.3)} do gasto entre clientes ativos</p>
            </article>
            <article>
              <span>Menor gasto com uso</span>
              <strong>{smallestWithUsage.client}</strong>
              <p>{currencyUsd(smallestWithUsage.spend)} · {REPORT.zeroSpendProjects.length} projetos sem gasto</p>
            </article>
          </div>
        </aside>
      </section>

      <section className={styles.tableCard}>
        <header className={styles.sectionHeader}>
          <div>
            <h2>Ranking por gasto</h2>
            <p>API Keys com consumo no mês. Projetos sem consumo ficam fora da lista principal.</p>
          </div>
          <span>{rows.length} chaves</span>
        </header>

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>API Key / Cliente</th>
                <th>Valor gasto</th>
                <th>% s/ ativos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.client}>
                  <td><span className={`${styles.rank} ${rankTone(index)}`.trim()}>{index + 1}</span></td>
                  <td><strong>{row.client}</strong></td>
                  <td>{currencyUsd(row.spend)}</td>
                  <td>{percent(row.shareOfActive)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className={styles.zeroProjects}>
          <strong>Sem gasto no mês</strong>
          <span>{REPORT.zeroSpendProjects.join(', ')}</span>
        </footer>
      </section>
    </main>
  );
}
