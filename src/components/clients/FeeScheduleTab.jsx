import { useEffect, useMemo, useState } from 'react';
import { updateClientFeeSteps } from '../../api/clients.js';
import { ApiError } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PlusIcon, SaveIcon, TrashIcon } from '../ui/Icons.jsx';
import Select from '../ui/Select.jsx';
import { fmtMoney } from '../../utils/format.js';
import { resolveClientFeeAtDate, sortFeeSteps, summarizeFeeSchedule } from '../../utils/feeSchedule.js';
import { formatLocaleNumber, parseLocaleNumber } from '../../utils/number.js';
import drawerStyles from './ClientDetailDrawer.module.css';
import styles from './FeeScheduleTab.module.css';

function monthKeyFromDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}$/.test(raw) ? raw : '';
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(value) {
  const month = String(value || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return 'Mês indefinido';
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1, 1);
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function buildMonthOptions(client, currentMonth) {
  const startRaw = String(client?.startDate || '').slice(0, 7);
  const endRaw = String(client?.endDate || '').slice(0, 7);
  const start = /^\d{4}-\d{2}$/.test(startRaw) ? startRaw : currentMonth;
  const end = /^\d{4}-\d{2}$/.test(endRaw) ? endRaw : '';

  const [startYear, startMonth] = start.split('-').map(Number);
  const startDate = new Date(startYear, startMonth - 1, 1);
  const options = [];
  const max = 48;

  for (let index = 0; index < max; index += 1) {
    const date = new Date(startDate.getFullYear(), startDate.getMonth() + index, 1);
    const key = monthKeyFromDate(date);
    options.push({ value: key, label: monthLabel(key) });
    if (end && key >= end) break;
  }

  if (!options.some((option) => option.value === currentMonth)) {
    options.push({ value: currentMonth, label: monthLabel(currentMonth) });
  }

  return options.sort((a, b) => a.value.localeCompare(b.value));
}

function fmtDateLabel(value) {
  if (!value) return 'Sem data';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Data inválida';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function buildRows(client) {
  return sortFeeSteps(client?.feeSteps || []).map((step) => ({
    id: step.id || `month-${step.month || Math.random().toString(36).slice(2, 10)}`,
    month: step.month || '',
    fee: step.fee != null ? formatLocaleNumber(step.fee, '') : '',
  }));
}

function validateRows(rows) {
  const seen = new Set();

  const normalized = rows
    .map((row, index) => ({
      ...row,
      month: String(row.month || '').slice(0, 7),
      fee: parseLocaleNumber(row.fee),
      index,
    }))
    .filter((row) => row.month || Number.isFinite(row.fee));

  for (const row of normalized) {
    if (!/^\d{4}-\d{2}$/.test(row.month)) {
      return { ok: false, message: `Selecione a competência da mensalidade ${row.index + 1}.` };
    }
    if (seen.has(row.month)) {
      return { ok: false, message: `Já existe mensalidade cadastrada para ${monthLabel(row.month)}.` };
    }
    if (!Number.isFinite(row.fee) || row.fee < 0) {
      return { ok: false, message: `Informe um valor válido para ${monthLabel(row.month)}.` };
    }
    seen.add(row.month);
  }

  return {
    ok: true,
    payload: normalized
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((row) => ({
        month: row.month,
        fee: row.fee,
      })),
  };
}

export default function FeeScheduleTab({ client, canEdit = false, onUpdated }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState(() => buildRows(client));
  const [saving, setSaving] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState('');
  const currentMonth = useMemo(() => monthKeyFromDate(new Date()), []);
  const monthOptions = useMemo(() => buildMonthOptions(client, currentMonth), [client?.startDate, client?.endDate, currentMonth]);
  const baseFee = useMemo(() => parseLocaleNumber(client?.fee, null), [client?.fee]);

  useEffect(() => {
    setRows(buildRows(client));
    setDeleteTargetId('');
  }, [client?.id, client?.feeSteps]);

  const schedule = useMemo(() => summarizeFeeSchedule(client), [client]);
  const currentFee = useMemo(() => resolveClientFeeAtDate(client), [client]);
  const contractRangeLabel = useMemo(() => {
    if (!client?.startDate) return 'Sem início';
    if (!client?.endDate) return `Desde ${fmtDateLabel(client.startDate)}`;
    return `${fmtDateLabel(client.startDate)} até ${fmtDateLabel(client.endDate)}`;
  }, [client?.startDate, client?.endDate]);

  const summaryItems = useMemo(
    () => [
      { label: 'Contrato', value: contractRangeLabel },
      { label: 'Mês atual', value: monthLabel(currentMonth) },
      { label: 'MRR atual', value: fmtMoney(currentFee) },
      { label: 'Registros', value: String(schedule.totalSteps || 0) },
    ],
    [contractRangeLabel, currentFee, currentMonth, schedule]
  );

  const handleFieldChange = (rowId, field, value) => {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
    );
  };

  const handleFeeBlur = (rowId) => {
    setRows((current) =>
      current.map((row) =>
        row.id === rowId ? { ...row, fee: formatLocaleNumber(row.fee, row.fee) } : row
      )
    );
  };

  const handleAdd = () => {
    setRows((current) => {
      const existing = new Set(current.map((row) => row.month).filter(Boolean));
      let month = currentMonth;
      if (existing.has(month)) {
        const date = new Date(`${month}-01T00:00:00`);
        do {
          date.setMonth(date.getMonth() + 1);
          month = monthKeyFromDate(date);
        } while (existing.has(month));
      }

      return [
        ...current,
        {
          id: `month-${Date.now()}`,
          month,
          fee: current.length === 0 && baseFee != null ? formatLocaleNumber(baseFee, '') : '',
        },
      ];
    });
  };

  const requestRemove = (rowId) => {
    setDeleteTargetId(rowId);
  };

  const cancelRemove = () => {
    setDeleteTargetId('');
  };

  const confirmRemove = () => {
    setRows((current) => current.filter((row) => row.id !== deleteTargetId));
    setDeleteTargetId('');
  };

  const handleSave = async () => {
    if (!client?.id || saving) return;
    const validation = validateRows(rows);
    if (!validation.ok) {
      showToast(validation.message, { variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      const response = await updateClientFeeSteps(client.id, validation.payload);
      const nextFeeSteps = Array.isArray(response?.feeSteps) ? response.feeSteps : [];
      const nextClient = response?.client || { ...client, feeSteps: nextFeeSteps };
      onUpdated?.({ ...nextClient, feeSteps: nextFeeSteps });
      showToast('Mensalidades atualizadas.', { variant: 'success' });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Não foi possível salvar as mensalidades.';
      showToast(message, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!client) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.summaryGrid}>
        {summaryItems.map((item) => (
          <div key={item.label} className={styles.summaryCard}>
            <span className={styles.summaryLabel}>{item.label}</span>
            <strong className={styles.summaryValue}>{item.value}</strong>

          </div>
        ))}
      </div>

      <div className={drawerStyles.section}>
        <div className={styles.sectionHead}>
          <div className={drawerStyles.sectionTitle}>Mensalidades por mês</div>
          {canEdit ? (
            <div className={styles.sectionActions}>
              <button
                type="button"
                className={`${drawerStyles.btn} ${drawerStyles.btnGhost} ${styles.actionButton}`.trim()}
                onClick={handleAdd}
              >
                <PlusIcon size={14} />
                <span>Adicionar mês</span>
              </button>
              <button
                type="button"
                className={`${drawerStyles.btn} ${drawerStyles.btnGhost} ${styles.actionButton}`.trim()}
                onClick={handleSave}
                disabled={saving}
              >
                <SaveIcon size={14} />
                <span>{saving ? 'Salvando' : 'Salvar alterações'}</span>
              </button>
            </div>
          ) : null}
        </div>

        <div className={styles.rows}>
          {rows.map((row) => (
            <div key={row.id} className={styles.rowCard}>
              <div className={styles.rowHeader}>
                <strong>{row.month ? monthLabel(row.month) : 'Nova mensalidade'}</strong>
                {canEdit ? (
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => requestRemove(row.id)}
                    aria-label="Remover mensalidade"
                    title="Remover mensalidade"
                    disabled={saving}
                  >
                    <TrashIcon size={14} />
                  </button>
                ) : null}
              </div>

              {deleteTargetId === row.id ? (
                <div className={styles.deleteConfirm}>
                  <strong>Excluir mensalidade?</strong>
                  <div className={styles.deleteConfirmActions}>
                    <button type="button" onClick={cancelRemove}>Cancelar</button>
                    <button type="button" className={styles.deleteConfirmDanger} onClick={confirmRemove}>Excluir</button>
                  </div>
                </div>
              ) : null}

              <div className={styles.rowGrid}>
                <div className={drawerStyles.field}>
                  <label className={drawerStyles.label} htmlFor={`fee-month-${row.id}`}>Mês referência</label>
                  <Select
                    id={`fee-month-${row.id}`}
                    className={styles.monthSelect}
                    value={row.month}
                    onChange={(event) => handleFieldChange(row.id, 'month', event.target.value)}
                    disabled={!canEdit || saving}
                    placeholder="Selecionar mês"
                    aria-label="Mês referência"
                    menuMinWidth={220}
                  >
                    {monthOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className={drawerStyles.field}>
                  <label className={drawerStyles.label} htmlFor={`fee-value-${row.id}`}>Mensalidade (R$)</label>
                  <input
                    id={`fee-value-${row.id}`}
                    className={drawerStyles.input}
                    type="text"
                    inputMode="decimal"
                    value={row.fee}
                    onChange={(event) => handleFieldChange(row.id, 'fee', event.target.value)}
                    onBlur={() => handleFeeBlur(row.id)}
                    disabled={!canEdit || saving}
                  />
                </div>
              </div>
            </div>
          ))}

          {rows.length === 0 ? (
            <div className={styles.emptyState}>
              Sem registros.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
