import { useCallback, useEffect, useRef, useState } from 'react';
import { updateClient, deleteClient } from '../../api/clients.js';
import { clientInitials } from '../../utils/clientHelpers.js';
import { ApiError } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { gdvOptions, gestorOptions } from '../../utils/responsibleUsers.js';
import { getUserAvatar } from '../../utils/avatarStorage.js';
import { formatLocaleNumber, parseLocaleNumber } from '../../utils/number.js';
import { CLIENT_STATUS_OPTIONS, normalizeClientStatus } from '../../utils/clientStatus.js';
import { CameraIcon, LogOutIcon, TrashIcon } from '../ui/Icons.jsx';
import DateField from '../ui/DateField.jsx';
import Select from '../ui/Select.jsx';
import drawerStyles from './ClientDetailDrawer.module.css';
import styles from './OverviewTab.module.css';

const DEBOUNCE_MS = 400;

function withCurrentResponsible(options, selectedName) {
  const currentName = String(selectedName || '').trim();
  const rows = Array.isArray(options) ? [...options] : [];
  if (currentName && !rows.some((entry) => String(entry?.name || '').trim() === currentName)) {
    rows.unshift({
      id: `current-${currentName}`,
      name: currentName,
      email: '',
      username: '',
      role: '',
      active: true,
    });
  }
  return rows;
}

function buildForm(client) {
  if (!client) {
    return {
      name: '',
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
    name: client.name || '',
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

export default function OverviewTab({
  client,
  squads = [],
  users = [],
  canEdit = false,
  canDelete = false,
  avatarUrl = '',
  canManageAvatar = false,
  onPickAvatar,
  onRemoveAvatar,
  onUpdated,
  onDeleted,
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState(() => buildForm(client));
  const [saving, setSaving] = useState({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const timersRef = useRef(new Map());

  useEffect(() => {
    setForm(buildForm(client));
    setConfirmingDelete(false);
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

  async function handleDelete() {
    if (!client?.id || deleting) return;
    setDeleting(true);
    try {
      await deleteClient(client.id);
      showToast('Cliente removido.', { variant: 'success' });
      onDeleted?.(client.id);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Erro ao remover cliente.';
      showToast(message, { variant: 'error' });
      setDeleting(false);
    }
  }

  if (!client) return null;

  const gestorRows = withCurrentResponsible(gestorOptions(users, form.gestor), form.gestor);
  const gdvRows = withCurrentResponsible(gdvOptions(users, form.gdvName), form.gdvName);

  return (
    <div className={styles.overviewShell}>
      <div className={`${drawerStyles.section} ${styles.mainSection}`}>
        <div className={drawerStyles.sectionTitle}>Dados principais</div>
        <div className={styles.profileGrid}>
          <aside className={styles.avatarCard}>
            <div className={styles.avatarPrimary} aria-label={`Imagem de ${client.name}`}>
              {avatarUrl ? <img src={avatarUrl} alt="" /> : clientInitials(client.name)}
            </div>

            {canManageAvatar ? (
              <div className={styles.avatarControls}>
                <button type="button" onClick={onPickAvatar} disabled={deleting} title="Alterar imagem" aria-label="Alterar imagem">
                  {avatarUrl ? 'Trocar imagem' : 'Alterar imagem'}
                </button>
                {avatarUrl ? (
                  <button
                    type="button"
                    className={styles.avatarRemoveButton}
                    onClick={onRemoveAvatar}
                    disabled={deleting}
                    title="Remover imagem"
                    aria-label="Remover imagem"
                  >
                    Remover
                  </button>
                ) : null}
              </div>
            ) : null}
          </aside>

          <div className={styles.profileFields}>
            <div className={`${drawerStyles.field} ${styles.profileFieldName}`}>
              <label className={drawerStyles.label} htmlFor="cd-name">Nome do cliente / Escritório</label>
              <input
                id="cd-name"
                className={drawerStyles.input}
                type="text"
                value={form.name}
                onChange={(event) => onTextChange('name', 'name', event.target.value)}
                disabled={deleting || !canEdit}
              />
            </div>

            <div className={drawerStyles.field}>
              <label className={drawerStyles.label} htmlFor="cd-gestor">Gestor da Conta</label>
              <Select
                type="user"
                className={drawerStyles.selectControl}
                value={form.gestor}
                onChange={(event) => onSelectChange('gestor', 'gestor', event.target.value)}
                disabled={deleting || !canEdit}
                placeholder="Sem gestor"
                aria-label="Gestor da Conta"
                menuMinWidth={260}
              >
                <option value="">Sem gestor</option>
                {gestorRows.map((entry) => (
                  <option key={entry.id || entry.name} value={entry.name} data-avatar={getUserAvatar(entry) || entry.avatarUrl || ''} data-name={entry.name}>{entry.name}</option>
                ))}
              </Select>
            </div>

            <div className={drawerStyles.field}>
              <label className={drawerStyles.label} htmlFor="cd-squad">Squad</label>
              <Select
                className={drawerStyles.selectControl}
                value={form.squadId}
                onChange={(event) => onSelectChange('squadId', 'squadId', event.target.value)}
                disabled={deleting || !canEdit}
                placeholder="Selecionar squad"
                aria-label="Squad do cliente"
              >
                <option value="">Sem squad</option>
                {squads.map((squad) => (
                  <option key={squad.id} value={squad.id}>{squad.name}</option>
                ))}
              </Select>
            </div>

            <div className={drawerStyles.field}>
              <label className={drawerStyles.label} htmlFor="cd-gdv">Gestor de Vendas</label>
              <Select
                type="user"
                className={drawerStyles.selectControl}
                value={form.gdvName}
                onChange={(event) => onSelectChange('gdvName', 'gdvName', event.target.value)}
                disabled={deleting || !canEdit}
                placeholder="Sem GDV"
                aria-label="Gestor de Vendas"
                menuMinWidth={260}
              >
                <option value="">Sem GDV</option>
                {gdvRows.map((entry) => (
                  <option key={entry.id || entry.name} value={entry.name} data-avatar={getUserAvatar(entry) || entry.avatarUrl || ''} data-name={entry.name}>{entry.name}</option>
                ))}
              </Select>
            </div>

            <div className={drawerStyles.field}>
              <label className={drawerStyles.label} htmlFor="cd-status">Status</label>
              <Select
                className={drawerStyles.selectControl}
                value={form.status}
                onChange={(event) => onSelectChange('status', 'status', event.target.value)}
                disabled={deleting || !canEdit}
                aria-label="Status do cliente"
              >
                {CLIENT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className={drawerStyles.section}>
        <div className={drawerStyles.sectionTitle}>Contrato</div>
        <div className={`${styles.formGrid} ${styles.contractGrid}`}>
          <div className={`${drawerStyles.field} ${styles.fieldQuarter}`}>
            <label className={drawerStyles.label} htmlFor="cd-start">Início</label>
            <DateField
              id="cd-start"
              value={form.startDate}
              onChange={(value) => onDateChange('startDate', 'startDate', value)}
              disabled={deleting || !canEdit}
              ariaLabel="Data de início"
            />
          </div>

          <div className={`${drawerStyles.field} ${styles.fieldQuarter}`}>
            <label className={drawerStyles.label} htmlFor="cd-end">Término</label>
            <DateField
              id="cd-end"
              value={form.endDate}
              onChange={(value) => onDateChange('endDate', 'endDate', value)}
              disabled={deleting || !canEdit}
              ariaLabel="Data de término"
            />
          </div>

          <div className={`${drawerStyles.field} ${styles.fieldQuarter}`}>
            <label className={drawerStyles.label} htmlFor="cd-fee">Mensalidade (R$)</label>
            <input
              id="cd-fee"
              className={drawerStyles.input}
              type="text"
              inputMode="decimal"
              value={form.fee}
              onChange={(event) => onTextChange('fee', 'fee', event.target.value, { number: true })}
              onBlur={() => onNumberBlur('fee')}
              disabled={deleting || !canEdit}
            />
          </div>

          <div className={`${drawerStyles.field} ${styles.fieldQuarter}`}>
            <label className={drawerStyles.label} htmlFor="cd-meta">Meta base</label>
            <input
              id="cd-meta"
              className={drawerStyles.input}
              type="text"
              inputMode="decimal"
              value={form.metaLucro}
              onChange={(event) => onTextChange('metaLucro', 'metaLucro', event.target.value, { number: true })}
              onBlur={() => onNumberBlur('metaLucro')}
              disabled={deleting || !canEdit}
            />
          </div>
        </div>
      </div>

      {canDelete && canEdit ? (
        <div className={`${drawerStyles.section} ${styles.dangerSection} ${styles.dangerFooter}`}>
          <div className={drawerStyles.sectionTitle}>Zona perigosa</div>
          {confirmingDelete ? (
            <div className={drawerStyles.confirmBar}>
              <div className={drawerStyles.confirmText}>
                Remover <strong>{client.name}</strong>? Isso também apaga projeto, métricas e análises vinculadas.
              </div>
              <div className={drawerStyles.confirmActions}>
                <button
                  type="button"
                  className={`${drawerStyles.btn} ${drawerStyles.btnGhost}`}
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={`${drawerStyles.btn} ${drawerStyles.btnDanger}`}
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Removendo...' : 'Confirmar exclusão'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`${drawerStyles.btn} ${drawerStyles.btnDanger} ${styles.deleteClientButton}`}
              onClick={() => setConfirmingDelete(true)}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <LogOutIcon size={13} />
                Excluir cliente
              </span>
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
