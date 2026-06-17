import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { updateClient, deleteClient } from '../../api/clients.js';
import { clientInitials } from '../../utils/clientHelpers.js';
import { ApiError } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { gdvOptions, gestorOptions } from '../../utils/responsibleUsers.js';
import { getSquadAvatar, getUserAvatar } from '../../utils/avatarStorage.js';
import { formatLocaleNumber, parseLocaleNumber } from '../../utils/number.js';
import { CLIENT_STATUS_OPTIONS, normalizeClientStatus } from '../../utils/clientStatus.js';
import { CameraIcon, LogOutIcon, TrashIcon } from '../ui/Icons.jsx';
import DateField from '../ui/DateField.jsx';
import Select from '../ui/Select.jsx';
import drawerStyles from './ClientDetailDrawer.module.css';
import FeeScheduleTab from './FeeScheduleTab.jsx';
import styles from './OverviewTab.module.css';

const DEBOUNCE_MS = 400;
const INTERNAL_SELLER_OPTIONS = ['Michael', 'Camila'];

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
      contractType: 'recurring',
      internalCommercial: 'no',
      internalSeller: '',
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
    contractType: client.contractType === 'tcv' || client.isTcv ? 'tcv' : 'recurring',
    internalCommercial: client.internalCommercial || client.internal_commercial_enabled ? 'yes' : 'no',
    internalSeller: client.internalSeller || client.internal_seller || '',
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
  canViewFeeSchedule = false,
  canEditFeeSchedule = false,
  onPickAvatar,
  onRemoveAvatar,
  onUpdated,
  onDeleted,
  variant = 'default',
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState(() => buildForm(client));
  const [saving, setSaving] = useState({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewingAvatar, setPreviewingAvatar] = useState(false);
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

  function onInternalCommercialChange(rawValue) {
    const enabled = rawValue === 'yes';
    setForm((current) => ({
      ...current,
      internalCommercial: enabled ? 'yes' : 'no',
      internalSeller: enabled ? current.internalSeller : '',
    }));
    commit('internalCommercial', {
      internalCommercial: enabled,
      internalSeller: enabled ? form.internalSeller.trim() : '',
    });
  }

  function onInternalSellerChange(rawValue) {
    setForm((current) => ({ ...current, internalSeller: rawValue }));
    commitDebounced('internalSeller', {
      internalCommercial: true,
      internalSeller: String(rawValue || '').trim(),
    });
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
  const isBare = variant === 'bare';

  return (
    <div className={`${styles.overviewShell} ${isBare ? styles.overviewShellBare : ''}`.trim()}>
      <div className={`${drawerStyles.section} ${styles.mainSection}`}>
        <div className={drawerStyles.sectionTitle}>Dados principais</div>
        <div className={styles.profileGrid}>
          <aside className={styles.avatarCard}>
            <button
              type="button"
              className={`${styles.avatarPrimary} ${avatarUrl ? styles.avatarPrimaryAction : ''}`.trim()}
              aria-label={avatarUrl ? `Visualizar imagem de ${client.name}` : `Imagem de ${client.name}`}
              onClick={() => avatarUrl && setPreviewingAvatar(true)}
              disabled={!avatarUrl}
            >
              {avatarUrl ? <img src={avatarUrl} alt="" /> : clientInitials(client.name)}
            </button>

            {canManageAvatar ? (
              <div className={styles.avatarControls}>
                <button
                  type="button"
                  className={styles.avatarIconButton}
                  onClick={onPickAvatar}
                  disabled={deleting}
                  title={avatarUrl ? 'Trocar imagem' : 'Adicionar imagem'}
                  aria-label={avatarUrl ? 'Trocar imagem' : 'Adicionar imagem'}
                >
                  <CameraIcon size={15} />
                </button>
                {avatarUrl ? (
                  <button
                    type="button"
                    className={`${styles.avatarIconButton} ${styles.avatarRemoveButton}`.trim()}
                    onClick={onRemoveAvatar}
                    disabled={deleting}
                    title="Remover imagem"
                    aria-label="Remover imagem"
                  >
                    <TrashIcon size={15} />
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
                type="squad"
                className={drawerStyles.selectControl}
                value={form.squadId}
                onChange={(event) => onSelectChange('squadId', 'squadId', event.target.value)}
                disabled={deleting || !canEdit}
                placeholder="Selecionar squad"
                aria-label="Squad do cliente"
              >
                <option value="">Sem squad</option>
                {squads.map((squad) => (
                  <option
                    key={squad.id}
                    value={squad.id}
                    data-avatar={getSquadAvatar(squad) || squad.avatarUrl || squad.logoUrl || ''}
                    data-name={squad.name}
                  >
                    {squad.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className={drawerStyles.field}>
              <label className={drawerStyles.label} htmlFor="cd-gdv">Gestor de Vendas</label>
              <Select
                type="gdv"
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

            <div className={drawerStyles.field}>
              <label className={drawerStyles.label} htmlFor="cd-internal-commercial">Comercial Interno</label>
              <Select
                id="cd-internal-commercial"
                className={drawerStyles.selectControl}
                value={form.internalCommercial}
                onChange={(event) => onInternalCommercialChange(event.target.value)}
                disabled={deleting || !canEdit || Boolean(saving.internalCommercial)}
                aria-label="Comercial Interno"
              >
                <option value="no">Não possui comercial interno</option>
                <option value="yes">Possui comercial interno</option>
              </Select>
            </div>

            {form.internalCommercial === 'yes' ? (
              <div className={drawerStyles.field}>
                <label className={drawerStyles.label} htmlFor="cd-internal-seller">Vendedor Interno</label>
                <input
                  id="cd-internal-seller"
                  className={drawerStyles.input}
                  type="text"
                  list="cd-internal-seller-options"
                  maxLength={80}
                  value={form.internalSeller}
                  onChange={(event) => onInternalSellerChange(event.target.value)}
                  disabled={deleting || !canEdit || Boolean(saving.internalSeller)}
                  placeholder="Michael, Camila ou novo vendedor"
                />
                <datalist id="cd-internal-seller-options">
                  {INTERNAL_SELLER_OPTIONS.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={drawerStyles.section}>
        <div className={drawerStyles.sectionTitle}>Contrato</div>
        <div className={`${styles.formGrid} ${styles.contractGrid}`}>
          <div className={`${drawerStyles.field} ${styles.fieldQuarter}`}>
            <label className={drawerStyles.label} htmlFor="cd-contract-type">Tipo de contrato</label>
            <Select
              id="cd-contract-type"
              className={drawerStyles.selectControl}
              value={form.contractType}
              onChange={(event) => onSelectChange('contractType', 'contractType', event.target.value)}
              disabled={deleting || !canEdit}
              aria-label="Tipo de contrato"
            >
              <option value="recurring">Recorrente</option>
              <option value="tcv">TCV (Valor Total / Venda Única)</option>
            </Select>
          </div>

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
            <label className={drawerStyles.label} htmlFor="cd-fee">{form.contractType === 'tcv' ? 'Valor total (R$)' : 'Mensalidade (R$)'}</label>
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

        {canViewFeeSchedule ? (
          <div className={styles.inlineFeeSchedule}>
            <FeeScheduleTab client={client} canEdit={canEditFeeSchedule} onUpdated={onUpdated} />
          </div>
        ) : null}
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

      {previewingAvatar && avatarUrl && typeof document !== 'undefined'
        ? createPortal(
            <div className={styles.avatarPreviewOverlay} role="presentation" onClick={() => setPreviewingAvatar(false)}>
              <div className={styles.avatarPreviewDialog} role="dialog" aria-modal="true" aria-label={`Imagem de ${client.name}`} onClick={(event) => event.stopPropagation()}>
                <img src={avatarUrl} alt="" />
                <button type="button" onClick={() => setPreviewingAvatar(false)} aria-label="Fechar imagem">×</button>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
