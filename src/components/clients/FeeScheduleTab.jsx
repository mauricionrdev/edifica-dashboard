import { useEffect, useMemo, useState } from 'react';
import { updateClientFeeSteps } from '../../api/clients.js';
import { ApiError } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PlusIcon, SaveIcon, TrashIcon } from '../ui/Icons.jsx';
import { fmtMoney } from '../../utils/format.js';
import { resolveClientFeeAtDate, sortFeeSteps, summarizeFeeSchedule } from '../../utils/feeSchedule.js';
import { formatLocaleNumber, parseLocaleNumber } from '../../utils/number.js';
import drawerStyles from './ClientDetailDrawer.module.css';
import styles from './FeeScheduleTab.module.css';

function fmtDateLabel(value) {
  if (!value) return 'Data indefinida';
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
    id: step.id || `step-${Math.random().toString(36).slice(2, 10)}`,
    label: step.label || '',
    startDate: step.startDate || '',
    endDate: step.endDate || '',
    fee: step.fee != null ? formatLocaleNumber(step.fee, '') : '',
  }));
}

function toComparableDate(value, fallback) {
  if (!value) return fallback;
  const timestamp = new Date(`${String(value).slice(0, 10)}T00:00:00`).getTime();
  return Number.isNaN(timestamp) ? fallback : timestamp;
}

function addDays(value, days) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function validateRows(rows, client) {
  const contractStartDate = String(client?.startDate || '').slice(0, 10);
  const contractEndDate = String(client?.endDate || '').slice(0, 10);

  if (rows.length > 0 && !contractStartDate) {
    return { ok: false, message: 'Defina o início do contrato na visão geral antes de criar fases.' };
  }

  const normalized = rows.map((row, index) => ({
    ...row,
    label: String(row.label || '').trim(),
    startDate: String(row.startDate || '').slice(0, 10),
    endDate: String(row.endDate || '').slice(0, 10),
    fee: parseLocaleNumber(row.fee),
    index,
  }));

  for (const row of normalized) {
    if (!row.startDate) {
      return { ok: false, message: `Preencha a data inicial da fase ${row.index + 1}.` };
    }
    if (!Number.isFinite(row.fee) || row.fee < 0) {
      return { ok: false, message: `Informe uma mensalidade válida na fase ${row.index + 1}.` };
    }
    if (row.endDate && row.endDate < row.startDate) {
      return { ok: false, message: `A data final da fase ${row.index + 1} não pode ser menor que a inicial.` };
    }
  }

  const sorted = [...normalized].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];

    if (index === 0 && current.startDate !== contractStartDate) {
      return { ok: false, message: 'A primeira fase precisa começar na data inicial do contrato.' };
    }

    if (current.startDate < contractStartDate) {
      return { ok: false, message: `A fase ${current.index + 1} começa antes do contrato.` };
    }

    if (contractEndDate) {
      if (!current.endDate) {
        return { ok: false, message: 'Com contrato fechado, toda fase precisa ter data final.' };
      }
      if (current.endDate > contractEndDate) {
        return { ok: false, message: `A fase ${current.index + 1} ultrapassa o término do contrato.` };
      }
    }

    if (!next) {
      if (contractEndDate && current.endDate !== contractEndDate) {
        return { ok: false, message: 'A última fase precisa terminar exatamente no fim do contrato.' };
      }
      continue;
    }

    const currentEnd = toComparableDate(current.endDate, Number.POSITIVE_INFINITY);
    const nextStart = toComparableDate(next.startDate, Number.NEGATIVE_INFINITY);
    if (currentEnd >= nextStart) {
      return {
        ok: false,
        message: `As fases ${current.index + 1} e ${next.index + 1} estão sobrepostas.`,
      };
    }

    if (!current.endDate) {
      return { ok: false, message: 'Apenas a última fase pode ficar sem data final.' };
    }

    if (next.startDate !== addDays(current.endDate, 1)) {
      return {
        ok: false,
        message: `As fases ${current.index + 1} e ${next.index + 1} precisam ser contínuas.`,
      };
    }
  }

  return {
    ok: true,
    payload: sorted.map((row) => ({
      label: row.label || null,
      startDate: row.startDate,
      endDate: row.endDate || null,
      fee: row.fee,
    })),
  };
}

export default function FeeScheduleTab({ client, canEdit = false, onUpdated }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState(() => buildRows(client));
  const [saving, setSaving] = useState(false);
  const baseFee = useMemo(() => parseLocaleNumber(client?.fee, null), [client?.fee]);

  useEffect(() => {
    setRows(buildRows(client));
  }, [client?.id, client?.feeSteps]);

  const schedule = useMemo(() => summarizeFeeSchedule(client), [client]);
  const currentFee = useMemo(() => resolveClientFeeAtDate(client), [client]);
  const contractRangeLabel = useMemo(() => {
    if (!client?.startDate) return 'Sem vigência';
    if (!client?.endDate) return `Desde ${fmtDateLabel(client.startDate)}`;
    return `${fmtDateLabel(client.startDate)} até ${fmtDateLabel(client.endDate)}`;
  }, [client?.startDate, client?.endDate]);

  const summaryItems = useMemo(
    () => [
      {
        label: 'Contrato',
        value: contractRangeLabel,
        sub: '',
      },
      {
        label: 'Atual',
        value: fmtMoney(currentFee),
        sub: schedule.current ? fmtDateLabel(schedule.current.startDate) : '',
      },
      {
        label: 'Próxima',
        value: schedule.next ? fmtMoney(parseLocaleNumber(schedule.next.fee, 0)) : '—',
        sub: schedule.next ? fmtDateLabel(schedule.next.startDate) : '',
      },
      {
        label: 'Fases',
        value: String(schedule.totalSteps || 0),
        sub: '',
      },
    ],
    [contractRangeLabel, currentFee, schedule]
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
    if (!client?.startDate) {
      showToast('Defina o início do contrato antes de adicionar fases.', { variant: 'error' });
      return;
    }

    setRows((current) => [
      ...current,
      {
        id: `step-${Date.now()}`,
        label: '',
        startDate:
          current.length === 0
            ? client?.startDate || ''
            : addDays(current[current.length - 1]?.endDate, 1) || client?.startDate || '',
        endDate: current.length === 0 ? client?.endDate || '' : '',
        fee: current.length === 0 && baseFee != null ? formatLocaleNumber(baseFee, '') : '',
      },
    ]);
  };

  const handleRemove = (rowId) => {
    setRows((current) => current.filter((row) => row.id !== rowId));
  };

  const handleSave = async () => {
    if (!client?.id || saving) return;
    const validation = validateRows(rows, client);
    if (!validation.ok) {
      showToast(validation.message, { variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      const response = await updateClientFeeSteps(client.id, validation.payload);
      const nextFeeSteps = Array.isArray(response?.feeSteps) ? response.feeSteps : [];
      onUpdated?.({ ...client, feeSteps: nextFeeSteps });
      showToast('Mensalidades atualizadas.', { variant: 'success' });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Não foi possível salvar as mensalidades.';
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
            {item.sub ? <span className={styles.summarySub}>{item.sub}</span> : null}
          </div>
        ))}
      </div>

      <div className={drawerStyles.section}>
        <div className={styles.sectionHead}>
          <div className={drawerStyles.sectionTitle}>Mensalidades</div>
          {canEdit ? (
            <button
              type="button"
              className={`${drawerStyles.btn} ${drawerStyles.btnGhost} ${styles.actionButton}`.trim()}
              onClick={handleAdd}
            >
              <PlusIcon size={14} />
              <span>Adicionar fase</span>
            </button>
          ) : null}
        </div>

        <div className={styles.rows}>
          {rows.map((row, index) => (
            <div key={row.id} className={styles.rowCard}>
              <div className={styles.rowHeader}>
                <strong>Fase {index + 1}</strong>
                {canEdit ? (
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => handleRemove(row.id)}
                    aria-label={`Remover fase ${index + 1}`}
                    title={`Remover fase ${index + 1}`}
                  >
                    <TrashIcon size={14} />
                  </button>
                ) : null}
              </div>

              <div className={styles.rowGrid}>
                <div className={drawerStyles.field}>
                  <label className={drawerStyles.label} htmlFor={`fee-label-${row.id}`}>
                    Rótulo
                  </label>
                  <input
                    id={`fee-label-${row.id}`}
                    className={drawerStyles.input}
                    type="text"
                    value={row.label}
                    onChange={(event) => handleFieldChange(row.id, 'label', event.target.value)}
                    disabled={!canEdit || saving}
                  />
                </div>

                <div className={drawerStyles.field}>
                  <label className={drawerStyles.label} htmlFor={`fee-start-${row.id}`}>
                    Início
                  </label>
                  <input
                    id={`fee-start-${row.id}`}
                    className={drawerStyles.input}
                    type="date"
                    value={row.startDate}
                    onChange={(event) => handleFieldChange(row.id, 'startDate', event.target.value)}
                    disabled={!canEdit || saving}
                  />
                </div>

                <div className={drawerStyles.field}>
                  <label className={drawerStyles.label} htmlFor={`fee-end-${row.id}`}>
                    Fim
                  </label>
                  <input
                    id={`fee-end-${row.id}`}
                    className={drawerStyles.input}
                    type="date"
                    value={row.endDate}
                    onChange={(event) => handleFieldChange(row.id, 'endDate', event.target.value)}
                    disabled={!canEdit || saving}
                  />
                </div>

                <div className={drawerStyles.field}>
                  <label className={drawerStyles.label} htmlFor={`fee-value-${row.id}`}>
                    Mensalidade (R$)
                  </label>
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
        </div>

        {canEdit ? (
          <div className={styles.footer}>
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
    </div>
  );
}
