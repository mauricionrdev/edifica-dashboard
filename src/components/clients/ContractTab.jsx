// ================================================================
//  ContractTab
//  Aba específica do contrato: 3 mini-cards de resumo + edição dos
//  campos comerciais (status, squad, GDV, gestor, datas, fee, meta).
//
//  Usa o mesmo padrão de edição inline com debounce do OverviewTab.
//  Separação do Overview é útil porque aqui o foco é financeiro/contratual
//  e mostramos o summary em formato "mini dashboard".
// ================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { updateClient } from '../../api/clients.js';
import { ApiError } from '../../api/client.js';
import { fmtMoney } from '../../utils/format.js';
import { daysBetween } from '../../utils/format.js';
import { useToast } from '../../context/ToastContext.jsx';
import drawerStyles from './ClientDetailDrawer.module.css';
import styles from './ContractTab.module.css';

const DEBOUNCE_MS = 400;

function buildForm(c) {
  if (!c) {
    return {
      squadId: '',
      gdvName: '',
      gestor: '',
      status: 'active',
      fee: '',
      metaLucro: '',
      startDate: '',
      endDate: '',
    };
  }
  return {
    squadId: c.squadId || '',
    gdvName: c.gdvName || '',
    gestor: c.gestor || '',
    status: c.status === 'churn' ? 'churn' : 'active',
    fee: c.fee != null ? String(c.fee) : '',
    metaLucro: c.metaLucro != null ? String(c.metaLucro) : '',
    startDate: c.startDate || '',
    endDate: c.endDate || '',
  };
}

export default function ContractTab({ client, squads = [], onUpdated }) {
  const { showToast } = useToast();

  const [form, setForm] = useState(() => buildForm(client));
  const [saving, setSaving] = useState({});
  const timersRef = useRef(new Map());

  useEffect(() => {
    setForm(buildForm(client));
    for (const t of timersRef.current.values()) clearTimeout(t);
    timersRef.current.clear();
  }, [client?.id]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const commit = useCallback(
    async (fieldKey, patch) => {
      if (!client?.id) return;
      setSaving((s) => ({ ...s, [fieldKey]: true }));
      try {
        const res = await updateClient(client.id, patch);
        onUpdated?.(res?.client);
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : 'Erro ao salvar alteração.';
        showToast(msg, { variant: 'error' });
        setForm(buildForm(client));
      } finally {
        setSaving((s) => {
          const next = { ...s };
          delete next[fieldKey];
          return next;
        });
      }
    },
    [client, onUpdated, showToast]
  );

  const commitDebounced = useCallback(
    (fieldKey, patch) => {
      const timers = timersRef.current;
      if (timers.has(fieldKey)) clearTimeout(timers.get(fieldKey));
      const t = setTimeout(() => {
        timers.delete(fieldKey);
        commit(fieldKey, patch);
      }, DEBOUNCE_MS);
      timers.set(fieldKey, t);
    },
    [commit]
  );

  function onTextChange(fieldKey, apiKey, rawValue, { number = false } = {}) {
    setForm((prev) => ({ ...prev, [fieldKey]: rawValue }));
    const value = number ? Number(rawValue) || 0 : String(rawValue || '').trim();
    commitDebounced(fieldKey, { [apiKey]: value });
  }

  function onSelectChange(fieldKey, apiKey, rawValue) {
    setForm((prev) => ({ ...prev, [fieldKey]: rawValue }));
    commit(fieldKey, {
      [apiKey]: rawValue || (apiKey === 'squadId' ? null : ''),
    });
  }

  function onDateChange(fieldKey, apiKey, rawValue) {
    setForm((prev) => ({ ...prev, [fieldKey]: rawValue }));
    commit(fieldKey, { [apiKey]: rawValue || null });
  }

  // --- resumo (3 mini-cards) ---
  const summary = useMemo(() => {
    const fee = Number(client?.fee) || 0;
    const mrr = client?.status === 'churn' ? 0 : fee;

    // Dias até o término
    const today = new Date();
    let daysLeft = null;
    if (client?.endDate) {
      const n = daysBetween(today, client.endDate);
      if (Number.isFinite(n)) daysLeft = n;
    }

    const active = client?.status !== 'churn';

    return {
      status: {
        label: 'Status',
        value: active ? 'Ativo' : 'Churn',
        sub: active ? 'contrato em operação' : 'contrato cancelado',
        tone: active ? 'green' : 'red',
      },
      mrr: {
        label: 'Mensalidade',
        value: fmtMoney(mrr),
        sub: active ? 'receita mensal atual' : 'churn — sem receita',
        tone: active ? '' : 'red',
      },
      days: {
        label: 'Vencimento',
        value:
          daysLeft === null
            ? '—'
            : daysLeft < 0
            ? 'Vencido'
            : daysLeft === 0
            ? 'Hoje'
            : `${daysLeft}d`,
        sub:
          daysLeft === null
            ? 'sem data de término'
            : daysLeft < 0
            ? 'vencido há ' + Math.abs(daysLeft) + ' dia(s)'
            : daysLeft <= 30
            ? 'vencendo em breve'
            : 'dias até renovação',
        tone: daysLeft !== null && daysLeft <= 30 && daysLeft >= 0 ? '' : '',
      },
    };
  }, [client]);

  if (!client) return null;

  return (
    <div className={styles.panel}>
      {/* Resumo */}
      <div className={styles.summary}>
        <div
          className={`${styles.summaryCard} ${
            summary.status.tone === 'green'
              ? styles.green
              : summary.status.tone === 'red'
              ? styles.red
              : ''
          }`.trim()}
        >
          <span className={styles.summaryLabel}>{summary.status.label}</span>
          <span
            className={`${styles.summaryValue} ${
              summary.status.tone === 'red' ? styles.red : ''
            }`.trim()}
          >
            {summary.status.value}
          </span>
          <span className={styles.summarySub}>{summary.status.sub}</span>
        </div>

        <div
          className={`${styles.summaryCard} ${
            summary.mrr.tone === 'red' ? styles.red : ''
          }`.trim()}
        >
          <span className={styles.summaryLabel}>{summary.mrr.label}</span>
          <span className={styles.summaryValue}>{summary.mrr.value}</span>
          <span className={styles.summarySub}>{summary.mrr.sub}</span>
        </div>

        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{summary.days.label}</span>
          <span className={styles.summaryValue}>{summary.days.value}</span>
          <span className={styles.summarySub}>{summary.days.sub}</span>
        </div>
      </div>

      {/* Form */}
      <div className={drawerStyles.section}>
        <div className={drawerStyles.sectionTitle}>Dados do contrato</div>
        <div className={drawerStyles.grid}>
          <div className={drawerStyles.field}>
            <label className={drawerStyles.label} htmlFor="ct-status">
              Status {saving.status ? '· salvando…' : ''}
            </label>
            <select
              id="ct-status"
              className={drawerStyles.select}
              value={form.status}
              onChange={(e) => onSelectChange('status', 'status', e.target.value)}
            >
              <option value="active">✓ Ativo</option>
              <option value="churn">✕ Churn / Cancelado</option>
            </select>
          </div>

          <div className={drawerStyles.field}>
            <label className={drawerStyles.label} htmlFor="ct-squad">
              Squad {saving.squadId ? '· salvando…' : ''}
            </label>
            <select
              id="ct-squad"
              className={drawerStyles.select}
              value={form.squadId}
              onChange={(e) => onSelectChange('squadId', 'squadId', e.target.value)}
            >
              <option value="">Sem squad</option>
              {squads.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className={drawerStyles.field}>
            <label className={drawerStyles.label} htmlFor="ct-gestor">
              Gestor de tráfego {saving.gestor ? '· salvando…' : ''}
            </label>
            <input
              id="ct-gestor"
              className={drawerStyles.input}
              type="text"
              value={form.gestor}
              onChange={(e) => onTextChange('gestor', 'gestor', e.target.value)}
            />
          </div>

          <div className={drawerStyles.field}>
            <label className={drawerStyles.label} htmlFor="ct-gdv">
              GDV responsável {saving.gdvName ? '· salvando…' : ''}
            </label>
            <input
              id="ct-gdv"
              className={drawerStyles.input}
              type="text"
              value={form.gdvName}
              onChange={(e) => onTextChange('gdvName', 'gdvName', e.target.value)}
            />
          </div>

          <div className={drawerStyles.field}>
            <label className={drawerStyles.label} htmlFor="ct-start">
              Data de início {saving.startDate ? '· salvando…' : ''}
            </label>
            <input
              id="ct-start"
              className={drawerStyles.input}
              type="date"
              value={form.startDate}
              onChange={(e) => onDateChange('startDate', 'startDate', e.target.value)}
            />
          </div>

          <div className={drawerStyles.field}>
            <label className={drawerStyles.label} htmlFor="ct-end">
              Data de término / renovação {saving.endDate ? '· salvando…' : ''}
            </label>
            <input
              id="ct-end"
              className={drawerStyles.input}
              type="date"
              value={form.endDate}
              onChange={(e) => onDateChange('endDate', 'endDate', e.target.value)}
            />
          </div>

          <div className={drawerStyles.field}>
            <label className={drawerStyles.label} htmlFor="ct-fee">
              Mensalidade (R$) {saving.fee ? '· salvando…' : ''}
            </label>
            <input
              id="ct-fee"
              className={drawerStyles.input}
              type="number"
              step="0.01"
              min="0"
              value={form.fee}
              onChange={(e) =>
                onTextChange('fee', 'fee', e.target.value, { number: true })
              }
            />
          </div>

          <div className={drawerStyles.field}>
            <label className={drawerStyles.label} htmlFor="ct-meta">
              Meta de lucro {saving.metaLucro ? '· salvando…' : ''}
            </label>
            <input
              id="ct-meta"
              className={drawerStyles.input}
              type="number"
              step="1"
              min="0"
              value={form.metaLucro}
              onChange={(e) =>
                onTextChange('metaLucro', 'metaLucro', e.target.value, {
                  number: true,
                })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
