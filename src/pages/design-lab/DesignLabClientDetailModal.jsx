import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../api/client.js';
import { deleteClient, updateClient, updateClientFeeSteps } from '../../api/clients.js';
import { useToast } from '../../context/ToastContext.jsx';
import { clientInitials, statusLabel } from '../../utils/clientHelpers.js';
import { CLIENT_STATUS_OPTIONS, normalizeClientStatus } from '../../utils/clientStatus.js';
import { getClientAvatar, getSquadAvatar, getUserAvatar, readAvatarFile, saveClientAvatar } from '../../utils/avatarStorage.js';
import { formatLocaleNumber, parseLocaleNumber } from '../../utils/number.js';
import { gdvOptions, gestorOptions } from '../../utils/responsibleUsers.js';
import { sortFeeSteps } from '../../utils/feeSchedule.js';
import {
  CameraIcon,
  CloseIcon,
  ClipboardListIcon,
  PlusIcon,
  SaveIcon,
  TrashIcon,
} from '../../components/ui/Icons.jsx';
import AnalysisTab from '../../components/clients/AnalysisTab.jsx';
import ClientBookTab from '../../components/clients/ClientBookTab.jsx';
import ClientProjectTab from '../../components/clients/ClientProjectTab.jsx';
import DesignLabClientDrivePanel from './DesignLabClientDrivePanel.jsx';
import ClientTasksTab from '../../components/clients/ClientTasksTab.jsx';
import ClientName, { isPremiumClient } from '../../components/clients/ClientName.jsx';
import Select from '../../components/ui/Select.jsx';
import styles from './DesignLabClientDetailModal.module.css';

function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function clientChurnMonthKey(client) {
  const year = Number(client?.churnYear || client?.churn_year);
  const month = Number(client?.churnMonth || client?.churn_month);
  if (year && month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, '0')}`;
  const raw = String(client?.churnDate || client?.churn_date || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(raw) ? raw : '';
}


const PRIMARY_TABS = [
  { key: 'overview', label: 'Visão geral' },
  { key: 'book', label: 'Book do cliente' },
  { key: 'drive', label: 'Drive' },
];

const ANALYSIS_TABS = [
  { key: 'icp', label: 'Análise ICP', tone: 'info' },
  { key: 'gdv', label: 'Análise GDV', tone: 'success' },
  { key: 'routes', label: 'Resumo de Rotas', tone: 'purple' },
];

const ANALYSIS_TYPES = {
  icp: 'icp',
  gdv: 'gdvanalise',
  routes: 'route_summary',
};

function buildForm(client) {
  return {
    name: client?.name || '',
    squadId: client?.squadId || '',
    gdvName: client?.gdvName || '',
    gestor: client?.gestor || '',
    status: normalizeClientStatus(client?.status || 'active'),
    churnMonth: clientChurnMonthKey(client),
    fee: client?.fee != null ? formatLocaleNumber(client.fee, '') : '',
    metaLucro: client?.metaLucro != null ? formatLocaleNumber(client.metaLucro, '') : '',
    startDate: client?.startDate || '',
    endDate: client?.endDate || '',
    contractType: client?.contractType === 'tcv' || client?.isTcv ? 'tcv' : 'recurring',
    internalCommercial: client?.internalCommercial || client?.internal_commercial_enabled ? 'yes' : 'no',
    internalSeller: client?.internalSeller || client?.internal_seller || '',
    isPremium: isPremiumClient(client) ? 'yes' : 'no',
  };
}

function toPayload(form) {
  return {
    name: form.name.trim(),
    squadId: form.squadId || null,
    gdvName: form.gdvName.trim(),
    gestor: form.gestor.trim(),
    status: normalizeClientStatus(form.status),
    churnMonth: normalizeClientStatus(form.status) === 'churn' ? form.churnMonth : '',
    fee: parseLocaleNumber(form.fee, 0),
    metaLucro: parseLocaleNumber(form.metaLucro, 0),
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    contractType: form.contractType === 'tcv' ? 'tcv' : 'recurring',
    internalCommercial: form.internalCommercial === 'yes',
    internalSeller: form.internalCommercial === 'yes' ? form.internalSeller.trim() : '',
    isPremium: form.isPremium === 'yes',
  };
}

function roleSelectOptions(rows, current) {
  const list = Array.isArray(rows) ? rows : [];
  const currentName = String(current || '').trim();
  if (!currentName || list.some((item) => item.name === currentName)) return list;
  return [{ id: `current-${currentName}`, name: currentName }, ...list];
}

function statusTone(status) {
  if (status === 'onboarding') return 'info';
  if (status === 'churn') return 'danger';
  if (status === 'paused' || status === 'rampage') return 'muted';
  return 'success';
}

function normalizeFeeType(value) {
  return String(value || '').trim() === 'single' ? 'single' : 'recurring';
}

function feeTypeLabel(type) {
  return normalizeFeeType(type) === 'single' ? 'Única' : 'Mensal';
}

function monthKeyFromDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(value) {
  const month = String(value || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return 'Mês indefinido';
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, monthNumber - 1, 1));
}

function buildFeeRows(client) {
  return sortFeeSteps(client?.feeSteps || []).map((step) => ({
    id: step.id || `fee-${step.type || 'recurring'}-${step.month || Math.random().toString(36).slice(2, 10)}`,
    month: step.month || '',
    type: normalizeFeeType(step.type),
    fee: step.fee != null ? formatLocaleNumber(step.fee, '') : '',
  }));
}

function validateFeeRows(rows) {
  const seen = new Set();
  const normalized = rows
    .map((row, index) => ({
      ...row,
      index,
      month: String(row.month || '').slice(0, 7),
      type: normalizeFeeType(row.type),
      fee: parseLocaleNumber(row.fee),
    }))
    .filter((row) => row.month || Number.isFinite(row.fee));

  for (const row of normalized) {
    if (!/^\d{4}-\d{2}$/.test(row.month)) {
      return { ok: false, message: `Selecione o mês da mensalidade ${row.index + 1}.` };
    }
    const key = `${row.type}:${row.month}`;
    if (seen.has(key)) {
      return { ok: false, message: `Já existe mensalidade ${feeTypeLabel(row.type).toLowerCase()} para ${monthLabel(row.month)}.` };
    }
    if (!Number.isFinite(row.fee) || row.fee < 0) {
      return { ok: false, message: `Informe um valor válido para ${monthLabel(row.month)}.` };
    }
    seen.add(key);
  }

  return {
    ok: true,
    payload: normalized
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((row) => ({ month: row.month, type: row.type, fee: row.fee })),
  };
}

function destructiveActionFromButton(button) {
  if (!button || button.disabled) return null;

  const label = [
    button.getAttribute('aria-label'),
    button.getAttribute('title'),
    button.textContent,
  ].filter(Boolean).join(' ').trim();

  const normalized = label.toLowerCase();
  if (!/(excluir|remover|apagar|deletar|delete|remove)/i.test(normalized)) return null;

  if (/cliente/.test(normalized)) {
    return {
      title: 'Excluir cliente?',
      description: 'Essa ação remove o cliente e pode afetar dados vinculados a ele. Confirme apenas se tiver certeza.',
      confirmLabel: 'Excluir cliente',
    };
  }

  if (/(imagem|foto|avatar|logo)/.test(normalized)) {
    return {
      title: 'Remover imagem?',
      description: 'A imagem atual do cliente será removida deste cadastro.',
      confirmLabel: 'Remover imagem',
    };
  }

  if (/(mensalidade|mês|mes|fee)/.test(normalized)) {
    return {
      title: 'Remover mensalidade?',
      description: 'Essa mensalidade será removida da lista. Salve as alterações para persistir a mudança.',
      confirmLabel: 'Remover mensalidade',
    };
  }

  return {
    title: 'Confirmar remoção?',
    description: 'Essa ação remove informações do cliente. Confirme apenas se tiver certeza.',
    confirmLabel: 'Confirmar remoção',
  };
}

function FeesPanel({ client, canEdit, onUpdated }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState(() => buildFeeRows(client));
  const [saving, setSaving] = useState(false);
  const currentMonth = useMemo(() => monthKeyFromDate(new Date()), []);

  useEffect(() => {
    setRows(buildFeeRows(client));
  }, [client?.id, client?.feeSteps]);

  function updateRow(id, field, value) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function handleFeeBlur(id) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, fee: formatLocaleNumber(row.fee, row.fee) } : row)));
  }

  function addRow(type = 'recurring') {
    const normalizedType = normalizeFeeType(type);
    setRows((current) => {
      const existing = new Set(current.filter((row) => normalizeFeeType(row.type) === normalizedType).map((row) => row.month));
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
          id: `fee-${normalizedType}-${Date.now()}`,
          month,
          type: normalizedType,
          fee: normalizedType === 'recurring' && current.length === 0 && client?.fee != null ? formatLocaleNumber(client.fee, '') : '',
        },
      ];
    });
  }

  async function saveRows() {
    if (!client?.id || saving) return;
    const validation = validateFeeRows(rows);
    if (!validation.ok) {
      showToast(validation.message, { variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      const response = await updateClientFeeSteps(client.id, validation.payload);
      const nextFeeSteps = Array.isArray(response?.feeSteps) ? response.feeSteps : [];
      onUpdated?.({ ...(response?.client || client), feeSteps: nextFeeSteps });
      showToast('Mensalidades atualizadas.', { variant: 'success' });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Não foi possível salvar as mensalidades.';
      showToast(message, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.feesPanel} aria-label="Mensalidades por mês">
      <header className={styles.sectionHeaderRow}>
        <div>
          <span className={styles.sectionKicker}>Mensalidades por mês</span>
        </div>
        {canEdit ? (
          <div className={styles.feeActions}>
            <button type="button" onClick={() => addRow('recurring')} disabled={saving}>
              <PlusIcon size={14} />
              Adicionar mês
            </button>
            <button type="button" onClick={() => addRow('single')} disabled={saving}>
              <PlusIcon size={14} />
              Mensalidade única
            </button>
            <button type="button" onClick={saveRows} disabled={saving}>
              <SaveIcon size={14} />
              {saving ? 'Salvando' : 'Salvar alterações'}
            </button>
          </div>
        ) : null}
      </header>

      <div className={styles.feeRows}>
        {rows.map((row) => (
          <article key={row.id} className={styles.feeCard}>
            <header className={styles.feeCardHeader}>
              <div>
                <strong>{row.month ? monthLabel(row.month) : 'Nova mensalidade'}</strong>
                <span>{feeTypeLabel(row.type)}</span>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  className={styles.deleteIconButton}
                  onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                  disabled={saving}
                  aria-label="Remover mensalidade"
                >
                  <TrashIcon size={14} />
                </button>
              ) : null}
            </header>

            <div className={styles.feeGrid}>
              <label className={styles.field}>
                <span>Mês referência</span>
                <input
                  type="month"
                  value={row.month}
                  onChange={(event) => updateRow(row.id, 'month', event.target.value)}
                  disabled={!canEdit || saving}
                />
              </label>

              <label className={styles.field}>
                <span>Mensalidade (R$)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={row.fee}
                  onChange={(event) => updateRow(row.id, 'fee', event.target.value)}
                  onBlur={() => handleFeeBlur(row.id)}
                  disabled={!canEdit || saving}
                />
              </label>
            </div>
          </article>
        ))}
        {rows.length === 0 ? <div className={styles.emptyState}>Sem mensalidades cadastradas.</div> : null}
      </div>
    </section>
  );
}

export default function DesignLabClientDetailModal({
  client,
  squads = [],
  users = [],
  canEditClient = false,
  canViewFeeSchedule = false,
  canEditFeeSchedule = false,
  canViewTasks = false,
  canViewProject = false,
  canCreateProject = false,
  canDelete = false,
  onClose,
  onUpdated,
  onDeleted,
  initialTab = 'overview',
}) {
  const [activeTab, setActiveTab] = useState(['book', 'drive', 'tasks', 'project', 'icp', 'gdv', 'routes'].includes(initialTab) ? initialTab : 'overview');
  const [form, setForm] = useState(() => buildForm(client));
  const [avatarUrl, setAvatarUrl] = useState(() => getClientAvatar(client));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const confirmedDestructiveButtons = useRef(new WeakSet());
  const [pendingConfirm, setPendingConfirm] = useState(null);

  const gestorRows = useMemo(() => roleSelectOptions(gestorOptions(users, form.gestor), form.gestor), [users, form.gestor]);
  const gdvRows = useMemo(() => roleSelectOptions(gdvOptions(users, form.gdvName), form.gdvName), [users, form.gdvName]);
  const activeAnalysisType = ANALYSIS_TYPES[activeTab];
  const currentSquad = squads.find((squad) => String(squad.id) === String(form.squadId));
  const tone = statusTone(form.status);

  useEffect(() => {
    setForm(buildForm(client));
    setAvatarUrl(getClientAvatar(client));
    setError('');
    setActiveTab(['book', 'drive', 'tasks', 'project', 'icp', 'gdv', 'routes'].includes(initialTab) ? initialTab : 'overview');
  }, [client?.id, initialTab]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (pendingConfirm) {
        setPendingConfirm(null);
        return;
      }
      onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pendingConfirm]);

  function handleDestructiveClickCapture(event) {
    const button = event.target?.closest?.('button');
    if (!button || confirmedDestructiveButtons.current.has(button)) return;

    // As abas embarcadas possuem confirmações próprias e alguns modais via portal.
    // O confirmador genérico do modal do cliente não deve interceptar essas ações,
    // porque isso abre duas confirmações e impede a execução da exclusão real.
    if (button.closest?.('[data-skip-client-destructive-confirm="true"]')) return;

    const action = destructiveActionFromButton(button);
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();

    setPendingConfirm({
      ...action,
      onConfirm: () => {
        confirmedDestructiveButtons.current.add(button);
        setPendingConfirm(null);
        button.click();
        window.setTimeout(() => {
          confirmedDestructiveButtons.current.delete(button);
        }, 0);
      },
    });
  }

  if (!client) return null;

  function setField(key, value) {
    setForm((previous) => {
      const next = { ...previous, [key]: value };
      if (key === 'internalCommercial' && value !== 'yes') next.internalSeller = '';
      if (key === 'status' && normalizeClientStatus(value) === 'churn' && !next.churnMonth) {
        next.churnMonth = currentMonthKey();
      }
      if (key === 'status' && normalizeClientStatus(value) !== 'churn') {
        next.churnMonth = '';
      }
      return next;
    });
  }

  function normalizeNumberField(key) {
    setForm((previous) => ({ ...previous, [key]: formatLocaleNumber(previous[key], previous[key]) }));
  }

  async function handleAvatarFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !client?.id || !canEditClient) return;
    try {
      const nextAvatar = await readAvatarFile(file);
      const response = await updateClient(client.id, { avatarUrl: nextAvatar });
      saveClientAvatar(client, nextAvatar);
      setAvatarUrl(nextAvatar);
      onUpdated?.(response?.client || { ...client, avatarUrl: nextAvatar });
    } catch (nextError) {
      setError(nextError?.message || 'Não foi possível salvar a imagem.');
    }
  }

  async function handleRemoveAvatar() {
    if (!client?.id || !canEditClient) return;
    try {
      const response = await updateClient(client.id, { avatarUrl: '' });
      saveClientAvatar(client, '');
      setAvatarUrl('');
      onUpdated?.(response?.client || { ...client, avatarUrl: '' });
    } catch (nextError) {
      setError(nextError?.message || 'Não foi possível remover a imagem.');
    }
  }

  async function handleSave(event) {
    event?.preventDefault?.();
    if (!canEditClient || saving) return;
    if (!form.name.trim()) {
      setError('Informe o nome do cliente.');
      return;
    }
    if (normalizeClientStatus(form.status) === 'churn' && !form.churnMonth) {
      setError('Selecione o mês do churn.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await updateClient(client.id, toPayload(form));
      onUpdated?.(response?.client || { ...client, ...toPayload(form) });
    } catch (nextError) {
      setError(nextError instanceof ApiError ? nextError.message : 'Não foi possível salvar o cliente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!canDelete || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await deleteClient(client.id);
      onDeleted?.(client.id);
    } catch (nextError) {
      setError(nextError instanceof ApiError ? nextError.message : 'Não foi possível excluir o cliente.');
      setDeleting(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <section className={styles.modal} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()} onClickCapture={handleDestructiveClickCapture}>
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={styles.avatar}>{avatarUrl ? <img src={avatarUrl} alt="" /> : clientInitials(form.name)}</span>
            <div className={styles.titleBlock}>
              <ClientName as="h2" client={{ ...client, isPremium: form.isPremium === 'yes' }} name={form.name || client.name} />
              <span className={`${styles.statusBadge} ${styles[`status_${tone}`]}`.trim()}>{statusLabel({ ...client, status: form.status })}</span>
            </div>
          </div>

          <div className={styles.headerActions}>
            {canViewTasks ? (
              <button
                type="button"
                className={`${styles.iconButton} ${activeTab === 'tasks' ? styles.headerActionActive : ''}`.trim()}
                onClick={() => setActiveTab('tasks')}
                aria-label="Tasks do cliente"
                title="Tasks"
              >
                <ClipboardListIcon size={15} />
              </button>
            ) : null}
            {canViewProject ? (
              <button
                type="button"
                className={`${styles.headerPill} ${activeTab === 'project' ? styles.headerActionActive : ''}`.trim()}
                onClick={() => setActiveTab('project')}
              >
                Projeto
              </button>
            ) : null}
            <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Fechar">
              <CloseIcon size={16} />
            </button>
          </div>
        </header>

        <nav className={styles.tabs} aria-label="Áreas do cliente">
          <div className={styles.primaryTabs}>
            {PRIMARY_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`.trim()}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className={styles.analysisTabs}>
            {ANALYSIS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`${styles.analysisTab} ${styles[`analysisTab_${tab.key}`] || ''} ${activeTab === tab.key ? styles.analysisTabActive : ''}`.trim()}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        <main className={styles.body}>
          {activeTab === 'overview' ? (
            <form className={styles.overview} onSubmit={handleSave}>
              <section className={styles.mainCard}>
                <div className={styles.overviewGrid}>
                  <aside className={styles.mediaPanel}>
                    <span className={styles.largeAvatar}>{avatarUrl ? <img src={avatarUrl} alt="" /> : clientInitials(form.name)}</span>
                    {canEditClient ? (
                      <div className={styles.avatarActions}>
                        <label className={styles.roundButton} title="Trocar imagem" aria-label="Trocar imagem">
                          <CameraIcon size={15} />
                          <input type="file" accept="image/*" onChange={handleAvatarFile} disabled={saving} />
                        </label>
                        {avatarUrl ? (
                          <button type="button" className={`${styles.roundButton} ${styles.roundButtonDanger}`.trim()} onClick={handleRemoveAvatar} disabled={saving} aria-label="Remover imagem" title="Remover imagem">
                            <TrashIcon size={15} />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </aside>

                  <div className={styles.formPanel}>
                    <label className={styles.fieldFull}>
                      <span>Nome do cliente / Escritório</span>
                      <input value={form.name} onChange={(event) => setField('name', event.target.value)} disabled={!canEditClient || saving} />
                    </label>

                    <Select
                      label="Cliente Premium?"
                      className={`${styles.formSelect} ${styles.premiumSelect}`.trim()}
                      value={form.isPremium}
                      onChange={(event) => setField('isPremium', event.target.value)}
                      disabled={!canEditClient || saving}
                      portal
                    >
                      <option value="no">Não</option>
                      <option value="yes">Sim</option>
                    </Select>

                    <div className={styles.mainFieldsGrid}>
                      <Select
                        label="Gestor da Conta"
                        className={styles.formSelect}
                        type="user"
                        value={gestorRows.find((entry) => entry.name === form.gestor)?.id || ''}
                        onChange={(event) => setField('gestor', gestorRows.find((entry) => entry.id === event.target.value)?.name || '')}
                        disabled={!canEditClient || saving}
                        portal
                      >
                        <option value="">Sem gestor</option>
                        {gestorRows.map((entry) => (
                          <option
                            key={entry.id}
                            value={entry.id}
                            data-avatar={getUserAvatar(entry) || entry.avatarUrl || ''}
                            data-name={entry.name}
                          >
                            {entry.name}
                          </option>
                        ))}
                      </Select>

                      <Select
                        label="Squad"
                        className={styles.formSelect}
                        type="squad"
                        value={form.squadId}
                        onChange={(event) => setField('squadId', event.target.value)}
                        disabled={!canEditClient || saving}
                        portal
                      >
                        <option value="">Sem squad</option>
                        {squads.map((squad) => (
                          <option
                            key={squad.id}
                            value={squad.id}
                            data-avatar={getSquadAvatar(squad) || squad.logoUrl || ''}
                            data-name={squad.name}
                          >
                            {squad.name}
                          </option>
                        ))}
                      </Select>

                      <Select
                        label="Gestor de Vendas"
                        className={styles.formSelect}
                        type="gdv"
                        value={gdvRows.find((entry) => entry.name === form.gdvName)?.id || ''}
                        onChange={(event) => setField('gdvName', gdvRows.find((entry) => entry.id === event.target.value)?.name || '')}
                        disabled={!canEditClient || saving}
                        portal
                      >
                        <option value="">Sem GDV</option>
                        {gdvRows.map((entry) => (
                          <option
                            key={entry.id}
                            value={entry.id}
                            data-avatar={getUserAvatar(entry) || entry.avatarUrl || ''}
                            data-name={entry.name}
                          >
                            {entry.name}
                          </option>
                        ))}
                      </Select>

                      <Select
                        label="Status"
                        className={styles.formSelect}
                        value={form.status}
                        onChange={(event) => setField('status', event.target.value)}
                        disabled={!canEditClient || saving}
                        portal
                      >
                        {CLIENT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </Select>

                      {normalizeClientStatus(form.status) === 'churn' ? (
                        <label className={`${styles.field} ${styles.churnMonthField || ''}`.trim()}>
                          <span>Mês do churn</span>
                          <input
                            type="month"
                            value={form.churnMonth}
                            onChange={(event) => setField('churnMonth', event.target.value)}
                            disabled={!canEditClient || saving}
                            required
                          />
                        </label>
                      ) : null}

                      <Select
                        label="Comercial Interno"
                        className={styles.formSelect}
                        value={form.internalCommercial}
                        onChange={(event) => setField('internalCommercial', event.target.value)}
                        disabled={!canEditClient || saving}
                        portal
                      >
                        <option value="no">Não possui</option>
                        <option value="yes">Possui</option>
                      </Select>

                      {form.internalCommercial === 'yes' ? (
                        <label className={styles.field}>
                          <span>Vendedor interno</span>
                          <input value={form.internalSeller} onChange={(event) => setField('internalSeller', event.target.value)} disabled={!canEditClient || saving} />
                        </label>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>

              <section className={styles.contractCard}>
                <div className={styles.sectionKicker}>Contrato</div>
                <div className={styles.contractGrid}>
                  <Select
                    label="Tipo de contrato"
                    className={styles.formSelect}
                    value={form.contractType}
                    onChange={(event) => setField('contractType', event.target.value)}
                    disabled={!canEditClient || saving}
                    portal
                  >
                    <option value="recurring">Recorrente</option>
                    <option value="tcv">TCV</option>
                  </Select>
                  <label className={styles.field}>
                    <span>Início</span>
                    <input type="date" value={form.startDate} onChange={(event) => setField('startDate', event.target.value)} disabled={!canEditClient || saving} />
                  </label>
                  <label className={styles.field}>
                    <span>Término</span>
                    <input type="date" value={form.endDate} onChange={(event) => setField('endDate', event.target.value)} disabled={!canEditClient || saving} />
                  </label>
                  <label className={styles.field}>
                    <span>Mensalidade (R$)</span>
                    <input value={form.fee} onChange={(event) => setField('fee', event.target.value)} onBlur={() => normalizeNumberField('fee')} disabled={!canEditClient || saving} />
                  </label>
                  <label className={styles.field}>
                    <span>Meta base</span>
                    <input value={form.metaLucro} onChange={(event) => setField('metaLucro', event.target.value)} onBlur={() => normalizeNumberField('metaLucro')} disabled={!canEditClient || saving} />
                  </label>
                </div>
              </section>

              {error ? <div className={styles.errorLine}>{error}</div> : null}

              {canViewFeeSchedule ? (
                <FeesPanel client={client} canEdit={canEditFeeSchedule} onUpdated={onUpdated} />
              ) : null}

              <footer className={styles.footerActions}>
                <div className={styles.footerLeft}>
                  <span>Zona perigosa</span>
                  {canDelete ? (
                    <button type="button" className={styles.dangerButton} onClick={handleDelete} disabled={deleting || saving}>
                      <TrashIcon size={14} />
                      Excluir cliente
                    </button>
                  ) : null}
                </div>
                <div className={styles.actionGroup}>
                  <button type="button" className={styles.secondaryButton} onClick={onClose}>Fechar</button>
                  {canEditClient ? <button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button> : null}
                </div>
              </footer>
            </form>
          ) : null}

          {activeTab === 'project' && canViewProject ? (
            <div className={`${styles.embeddedPanel} ${styles.projectHost}`.trim()}>
              <ClientProjectTab client={client} users={users} canCreateProject={canCreateProject} />
            </div>
          ) : null}
          {activeTab === 'tasks' && canViewTasks ? <div className={styles.embeddedPanel}><ClientTasksTab client={client} /></div> : null}
          {activeTab === 'book' ? <div className={styles.embeddedPanel}><ClientBookTab client={client} /></div> : null}
          {activeTab === 'drive' ? <div className={styles.embeddedPanel}><DesignLabClientDrivePanel client={client} canEdit={canEditClient} /></div> : null}
          {activeAnalysisType ? (
            <div
              className={`${styles.embeddedPanel} ${styles.analysisHost}`.trim()}
              data-skip-client-destructive-confirm="true"
            >
              <AnalysisTab clientId={client.id} type={activeAnalysisType} canEdit={canEditClient} />
            </div>
          ) : null}
        </main>

        {pendingConfirm ? (
          <div className={styles.confirmOverlay} role="presentation" onClick={() => setPendingConfirm(null)}>
            <div
              className={styles.confirmDialog}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="design-lab-confirm-title"
              aria-describedby="design-lab-confirm-description"
              onClick={(event) => event.stopPropagation()}
            >
              <div>
                <span className={styles.confirmKicker}>Confirmação necessária</span>
                <h3 id="design-lab-confirm-title">{pendingConfirm.title}</h3>
                <p id="design-lab-confirm-description">{pendingConfirm.description}</p>
              </div>

              <div className={styles.confirmActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => setPendingConfirm(null)}>
                  Cancelar
                </button>
                <button type="button" className={styles.dangerButton} onClick={pendingConfirm.onConfirm}>
                  <TrashIcon size={14} />
                  {pendingConfirm.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
