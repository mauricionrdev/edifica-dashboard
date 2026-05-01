import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { updateClient } from '../../api/clients.js';
import { ApiError } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { daysBetween, fmtMoney } from '../../utils/format.js';
import {
  resolveClientFeeAtDate,
  summarizeFeeSchedule,
} from '../../utils/feeSchedule.js';
import { formatLocaleNumber, parseLocaleNumber } from '../../utils/number.js';
import { CLIENT_STATUS_OPTIONS, isActiveClientStatus, normalizeClientStatus } from '../../utils/clientStatus.js';
import { gdvOptions, gestorOptions, userLabel } from '../../utils/responsibleUsers.js';
import DateField from '../ui/DateField.jsx';
import Select from '../ui/Select.jsx';
import drawerStyles from './ClientDetailDrawer.module.css';
import styles from './ContractTab.module.css';

const DEBOUNCE_MS = 400;

function buildForm(client) {
  if (!client) {
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
    squadId: client.squadId || '',
    gdvName: client.gdvName || '',
    gestor: client.gestor || '',
    status: normalizeClientStatus(client.status),
    fee: client.fee != null ? formatLocaleNumber(client.fee, '') : '',
    metaLucro: client.metaLucro != null ? formatLocaleNumber(client.metaLucro, '') : '',
    startDate: client.startDate || '',
    endDate: client.endDate || '',
  };
}

export default function ContractTab({
  client,
  squads = [],
  users = [],
  canEdit = false,
  onUpdated,
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState(() => buildForm(client));
  const [saving, setSaving] = useState({});
  const timersRef = useRef(new Map());

  useEffect(() => {
    setForm(buildForm(client));
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
  }, [client?.id]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const commit = useCallback(
    async (fieldKey, patch) => {
      if (!client?.id) return;
      setSaving((current) => ({ ...current, [fieldKey]: true }));
      try {
        const response = await updateClient(client.id, patch);
        onUpdated?.(response?.client);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Erro ao salvar alteração.';
        showToast(message, { variant: 'error' });
        setForm(buildForm(client));
      } finally {
        setSaving((current) => {
          const next = { ...current };
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
      const timer = setTimeout(() => {
        timers.delete(fieldKey);
        commit(fieldKey, patch);
      }, DEBOUNCE_MS);
      timers.set(fieldKey, timer);
    },
    [commit]
  );

  function onTextChange(fieldKey, apiKey, rawValue, { number = false } = {}) {
    setForm((current) => ({ ...current, [fieldKey]: rawValue }));
    const value = number ? parseLocaleNumber(rawValue, 0) : String(rawValue || '').trim();
    commitDebounced(fieldKey, { [apiKey]: value });
  }

  function onSelectChange(fieldKey, apiKey, rawValue) {
    setForm((current) => ({ ...current, [fieldKey]: rawValue }));
    commit(fieldKey, { [apiKey]: rawValue || (apiKey === 'squadId' ? null : '') });
  }

  function onDateChange(fieldKey, apiKey, rawValue) {
    setForm((current) => ({ ...current, [fieldKey]: rawValue }));
    commit(fieldKey, { [apiKey]: rawValue || null });
  }

  function onNumberBlur(fieldKey) {
    setForm((current) => ({
      ...current,
      [fieldKey]: formatLocaleNumber(current[fieldKey], current[fieldKey]),
    }));
  }

  const summary = useMemo(() => {
    const currentFee = resolveClientFeeAtDate(client);
    const feeSchedule = summarizeFeeSchedule(client);
    const active = isActiveClientStatus(client?.status);

    const today = new Date();
    let daysLeft = null;
    if (client?.endDate) {
      const total = daysBetween(today, client.endDate);
      if (Number.isFinite(total)) daysLeft = total;
    }

    const statusOption = CLIENT_STATUS_OPTIONS.find((option) => option.value === normalizeClientStatus(client?.status));

    return {
      status: {
        label: 'Status',
        value: statusOption?.label || 'Ativo',
        tone: active ? 'green' : 'red',
      },
      fee: {
        label: 'Mensalidade',
        value: fmtMoney(active ? currentFee : 0),
        tone: active ? '' : 'red',
      },
      schedule: {
        label: 'Fases',
        value: String(feeSchedule.totalSteps || 0),
      },
      days: {
        label: 'Prazo',
        value:
          daysLeft == null
            ? '-'
            : daysLeft < 0
              ? 'Vencido'
              : daysLeft === 0
                ? 'Hoje'
                : `${daysLeft}d`,
      },
    };
  }, [client]);

  if (!client) return null;

  const gestorRows = gestorOptions(users, form.gestor);
  const gdvRows = gdvOptions(users, form.gdvName);

  return (
    <div className={styles.panel}>
      <div className={styles.summary}>
        {Object.values(summary).map((item) => (
          <div
            key={item.label}
            className={`${styles.summaryCard} ${
              item.tone === 'green' ? styles.green : item.tone === 'red' ? styles.red : ''
            }`.trim()}
          >
            <span className={styles.summaryLabel}>{item.label}</span>
            <span className={styles.summaryValue}>{item.value}</span>
          </div>
        ))}
      </div>

      <div className={drawerStyles.section}>
        <div className={drawerStyles.sectionTitle}>Dados do contrato</div>
        <div className={drawerStyles.grid}>
          <div className={drawerStyles.field}>
            <label className={drawerStyles.label} htmlFor="ct-status">Status</label>
            <Select
              className={drawerStyles.selectControl}
              value={form.status}
              onChange={(event) => onSelectChange('status', 'status', event.target.value)}
              disabled={!canEdit}
              aria-label="Status do contrato"
            >
              {CLIENT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>

          <div className={drawerStyles.field}>
            <label className={drawerStyles.label} htmlFor="ct-squad">Squad</label>
            <Select
              className={drawerStyles.selectControl}
              value={form.squadId}
              onChange={(event) => onSelectChange('squadId', 'squadId', event.target.value)}
              disabled={!canEdit}
              placeholder="Selecionar squad"
              aria-label="Squad do contrato"
            >
              <option value="">Sem squad</option>
              {squads.map((squad) => (
                <option key={squad.id} value={squad.id}>{squad.name}</option>
              ))}
            </Select>
          </div>

          <div className={drawerStyles.field}>
            <span className={drawerStyles.label}>Gestor</span>
            <Select
              className={drawerStyles.selectControl}
              value={form.gestor}
              onChange={(event) => onSelectChange('gestor', 'gestor', event.target.value)}
              disabled={!canEdit}
              placeholder="Selecionar gestor"
              aria-label="Gestor"
            >
              <option value="">Sem gestor</option>
              {gestorRows.map((entry) => (
                <option key={entry.id || entry.name} value={entry.name}>{userLabel(entry)}</option>
              ))}
            </Select>
          </div>

          <div className={drawerStyles.field}>
            <span className={drawerStyles.label}>GDV</span>
            <Select
              className={drawerStyles.selectControl}
              value={form.gdvName}
              onChange={(event) => onSelectChange('gdvName', 'gdvName', event.target.value)}
              disabled={!canEdit}
              placeholder="Selecionar GDV"
              aria-label="GDV"
            >
              <option value="">Sem GDV</option>
              {gdvRows.map((entry) => (
                <option key={entry.id || entry.name} value={entry.name}>{userLabel(entry)}</option>
              ))}
            </Select>
          </div>

          <div className={drawerStyles.field}>
            <label className={drawerStyles.label} htmlFor="ct-start">Início</label>
            <DateField
              id="ct-start"
              value={form.startDate}
              onChange={(value) => onDateChange('startDate', 'startDate', value)}
              disabled={!canEdit}
              ariaLabel="Data de início"
            />
          </div>

          <div className={drawerStyles.field}>
            <label className={drawerStyles.label} htmlFor="ct-end">Término</label>
            <DateField
              id="ct-end"
              value={form.endDate}
              onChange={(value) => onDateChange('endDate', 'endDate', value)}
              disabled={!canEdit}
              ariaLabel="Data de término"
            />
          </div>

          <div className={drawerStyles.field}>
            <label className={drawerStyles.label} htmlFor="ct-fee">Mensalidade base (R$)</label>
            <input
              id="ct-fee"
              className={drawerStyles.input}
              type="text"
              inputMode="decimal"
              value={form.fee}
              onChange={(event) => onTextChange('fee', 'fee', event.target.value, { number: true })}
              onBlur={() => onNumberBlur('fee')}
              disabled={!canEdit}
            />
          </div>

          <div className={drawerStyles.field}>
            <label className={drawerStyles.label} htmlFor="ct-meta">Meta base</label>
            <input
              id="ct-meta"
              className={drawerStyles.input}
              type="text"
              inputMode="decimal"
              value={form.metaLucro}
              onChange={(event) => onTextChange('metaLucro', 'metaLucro', event.target.value, { number: true })}
              onBlur={() => onNumberBlur('metaLucro')}
              disabled={!canEdit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
