import { useEffect, useMemo, useState } from 'react';
import { updateClient, deleteClient } from '../../api/clients.js';
import { ApiError } from '../../api/client.js';
import { clientInitials, statusLabel } from '../../utils/clientHelpers.js';
import { CLIENT_STATUS_OPTIONS, normalizeClientStatus } from '../../utils/clientStatus.js';
import { getClientAvatar, readAvatarFile, saveClientAvatar } from '../../utils/avatarStorage.js';
import { formatLocaleNumber, parseLocaleNumber } from '../../utils/number.js';
import { gdvOptions, gestorOptions } from '../../utils/responsibleUsers.js';
import { CloseIcon, CameraIcon, TrashIcon } from '../../components/ui/Icons.jsx';
import AnalysisTab from '../../components/clients/AnalysisTab.jsx';
import styles from './DesignLabClientDetailModal.module.css';

const INTERNAL_SELLER_OPTIONS = ['Michael', 'Camila'];
const ANALYSIS_TABS = [
  { key: 'icp', label: 'ICP', type: 'icp' },
  { key: 'gdv', label: 'GDV', type: 'gdvanalise' },
  { key: 'routes', label: 'Rotas', type: 'route_summary' },
];

function buildForm(client) {
  return {
    name: client?.name || '',
    squadId: client?.squadId || '',
    gdvName: client?.gdvName || '',
    gestor: client?.gestor || '',
    status: normalizeClientStatus(client?.status || 'active'),
    fee: client?.fee != null ? formatLocaleNumber(client.fee, '') : '',
    metaLucro: client?.metaLucro != null ? formatLocaleNumber(client.metaLucro, '') : '',
    startDate: client?.startDate || '',
    endDate: client?.endDate || '',
    contractType: client?.contractType === 'tcv' || client?.isTcv ? 'tcv' : 'recurring',
    internalCommercial: client?.internalCommercial || client?.internal_commercial_enabled ? 'yes' : 'no',
    internalSeller: client?.internalSeller || client?.internal_seller || '',
  };
}

function toPayload(form) {
  return {
    name: form.name.trim(),
    squadId: form.squadId || null,
    gdvName: form.gdvName.trim(),
    gestor: form.gestor.trim(),
    status: normalizeClientStatus(form.status),
    fee: parseLocaleNumber(form.fee, 0),
    metaLucro: parseLocaleNumber(form.metaLucro, 0),
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    contractType: form.contractType === 'tcv' ? 'tcv' : 'recurring',
    internalCommercial: form.internalCommercial === 'yes',
    internalSeller: form.internalCommercial === 'yes' ? form.internalSeller.trim() : '',
  };
}

function roleSelectOptions(rows, current) {
  const list = Array.isArray(rows) ? rows : [];
  const currentName = String(current || '').trim();
  if (!currentName || list.some((item) => item.name === currentName)) return list;
  return [{ id: `current-${currentName}`, name: currentName }, ...list];
}

function toneForStatus(status) {
  if (status === 'onboarding') return 'info';
  if (status === 'churn') return 'danger';
  if (status === 'paused') return 'muted';
  if (status === 'rampage') return 'muted';
  return 'success';
}

export default function DesignLabClientDetailModal({
  client,
  squads = [],
  users = [],
  canEditClient = false,
  canDelete = false,
  onClose,
  onUpdated,
  onDeleted,
  initialTab = 'overview',
}) {
  const [activeTab, setActiveTab] = useState(
    ['icp', 'gdv', 'routes'].includes(initialTab) ? initialTab : 'overview'
  );
  const [form, setForm] = useState(() => buildForm(client));
  const [avatarUrl, setAvatarUrl] = useState(() => getClientAvatar(client));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const gestorRows = useMemo(
    () => roleSelectOptions(gestorOptions(users, form.gestor), form.gestor),
    [users, form.gestor]
  );
  const gdvRows = useMemo(
    () => roleSelectOptions(gdvOptions(users, form.gdvName), form.gdvName),
    [users, form.gdvName]
  );

  useEffect(() => {
    setForm(buildForm(client));
    setAvatarUrl(getClientAvatar(client));
    setError('');
    setActiveTab(['icp', 'gdv', 'routes'].includes(initialTab) ? initialTab : 'overview');
  }, [client?.id, initialTab]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!client) return null;

  function setField(key, value) {
    setForm((previous) => {
      const next = { ...previous, [key]: value };
      if (key === 'internalCommercial' && value !== 'yes') next.internalSeller = '';
      return next;
    });
  }

  function normalizeNumberField(key) {
    setForm((previous) => ({
      ...previous,
      [key]: formatLocaleNumber(previous[key], previous[key]),
    }));
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

  async function handleSave(event) {
    event?.preventDefault?.();
    if (!canEditClient || saving) return;

    if (!form.name.trim()) {
      setError('Informe o nome do cliente.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await updateClient(client.id, toPayload(form));
      onUpdated?.(response?.client || { ...client, ...toPayload(form) });
    } catch (nextError) {
      const message = nextError instanceof ApiError
        ? nextError.message
        : 'Não foi possível salvar o cliente.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!canDelete || deleting) return;
    const confirmed = window.confirm(`Excluir ${client.name}?`);
    if (!confirmed) return;

    setDeleting(true);
    setError('');

    try {
      await deleteClient(client.id);
      onDeleted?.(client.id);
    } catch (nextError) {
      const message = nextError instanceof ApiError
        ? nextError.message
        : 'Não foi possível excluir o cliente.';
      setError(message);
      setDeleting(false);
    }
  }

  const statusTone = toneForStatus(form.status);
  const currentAnalysis = ANALYSIS_TABS.find((tab) => tab.key === activeTab);

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="design-lab-client-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={styles.avatar}>
              {avatarUrl ? <img src={avatarUrl} alt="" /> : clientInitials(form.name)}
            </span>
            <div className={styles.titleBlock}>
              <h2 id="design-lab-client-detail-title">{form.name || client.name}</h2>
              <span className={`${styles.statusBadge} ${styles[`status_${statusTone}`]}`.trim()}>
                {statusLabel({ ...client, status: form.status })}
              </span>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Fechar">
              <CloseIcon size={16} />
            </button>
          </div>
        </header>

        <nav className={styles.tabs} aria-label="Áreas do cliente">
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'overview' ? styles.tabActive : ''}`.trim()}
            onClick={() => setActiveTab('overview')}
          >
            Dados
          </button>
          {ANALYSIS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`.trim()}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <main className={styles.body}>
          {activeTab === 'overview' ? (
            <form className={styles.overview} onSubmit={handleSave}>
              <aside className={styles.mediaPanel}>
                <span className={styles.largeAvatar}>
                  {avatarUrl ? <img src={avatarUrl} alt="" /> : clientInitials(form.name)}
                </span>

                {canEditClient ? (
                  <label className={styles.mediaButton}>
                    <CameraIcon size={13} />
                    Trocar foto
                    <input type="file" accept="image/*" onChange={handleAvatarFile} disabled={saving} />
                  </label>
                ) : null}

                <div className={styles.summaryStack}>
                  <span>
                    <small>Squad</small>
                    <strong>{squads.find((squad) => String(squad.id) === String(form.squadId))?.name || 'Sem squad'}</strong>
                  </span>
                  <span>
                    <small>Contrato</small>
                    <strong>{form.contractType === 'tcv' ? 'TCV' : 'Recorrente'}</strong>
                  </span>
                </div>
              </aside>

              <section className={styles.formPanel}>
                <div className={styles.sectionTitle}>Dados principais</div>

                <div className={styles.formGrid}>
                  <label className={styles.fieldFull}>
                    <span>Nome do cliente</span>
                    <input
                      value={form.name}
                      onChange={(event) => setField('name', event.target.value)}
                      disabled={!canEditClient || saving}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Squad</span>
                    <select
                      value={form.squadId}
                      onChange={(event) => setField('squadId', event.target.value)}
                      disabled={!canEditClient || saving}
                    >
                      <option value="">Sem squad</option>
                      {squads.map((squad) => (
                        <option key={squad.id} value={squad.id}>{squad.name}</option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span>Status</span>
                    <select
                      value={form.status}
                      onChange={(event) => setField('status', event.target.value)}
                      disabled={!canEditClient || saving}
                    >
                      {CLIENT_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span>Gestor</span>
                    <select
                      value={gestorRows.find((entry) => entry.name === form.gestor)?.id || ''}
                      onChange={(event) => {
                        const selected = gestorRows.find((entry) => entry.id === event.target.value);
                        setField('gestor', selected?.name || '');
                      }}
                      disabled={!canEditClient || saving}
                    >
                      <option value="">Sem gestor</option>
                      {gestorRows.map((entry) => (
                        <option key={entry.id} value={entry.id}>{entry.name}</option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span>GDV</span>
                    <select
                      value={gdvRows.find((entry) => entry.name === form.gdvName)?.id || ''}
                      onChange={(event) => {
                        const selected = gdvRows.find((entry) => entry.id === event.target.value);
                        setField('gdvName', selected?.name || '');
                      }}
                      disabled={!canEditClient || saving}
                    >
                      <option value="">Sem GDV</option>
                      {gdvRows.map((entry) => (
                        <option key={entry.id} value={entry.id}>{entry.name}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className={styles.sectionTitle}>Comercial e contrato</div>

                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>Comercial interno</span>
                    <select
                      value={form.internalCommercial}
                      onChange={(event) => setField('internalCommercial', event.target.value)}
                      disabled={!canEditClient || saving}
                    >
                      <option value="no">Não possui</option>
                      <option value="yes">Possui</option>
                    </select>
                  </label>

                  {form.internalCommercial === 'yes' ? (
                    <label className={styles.field}>
                      <span>Vendedor interno</span>
                      <input
                        value={form.internalSeller}
                        onChange={(event) => setField('internalSeller', event.target.value)}
                        list="design-lab-detail-sellers"
                        disabled={!canEditClient || saving}
                      />
                      <datalist id="design-lab-detail-sellers">
                        {INTERNAL_SELLER_OPTIONS.map((name) => (
                          <option key={name} value={name} />
                        ))}
                      </datalist>
                    </label>
                  ) : null}

                  <label className={styles.field}>
                    <span>Tipo</span>
                    <select
                      value={form.contractType}
                      onChange={(event) => setField('contractType', event.target.value)}
                      disabled={!canEditClient || saving}
                    >
                      <option value="recurring">Recorrente</option>
                      <option value="tcv">TCV</option>
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span>Valor</span>
                    <input
                      value={form.fee}
                      onChange={(event) => setField('fee', event.target.value)}
                      onBlur={() => normalizeNumberField('fee')}
                      disabled={!canEditClient || saving}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Início</span>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(event) => setField('startDate', event.target.value)}
                      disabled={!canEditClient || saving}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Término</span>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(event) => setField('endDate', event.target.value)}
                      disabled={!canEditClient || saving}
                    />
                  </label>

                  <label className={styles.fieldSmall}>
                    <span>Meta base</span>
                    <input
                      value={form.metaLucro}
                      onChange={(event) => setField('metaLucro', event.target.value)}
                      onBlur={() => normalizeNumberField('metaLucro')}
                      disabled={!canEditClient || saving}
                    />
                  </label>
                </div>

                {error ? <div className={styles.errorLine}>{error}</div> : null}

                <div className={styles.actions}>
                  {canDelete ? (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={handleDelete}
                      disabled={deleting || saving}
                    >
                      <TrashIcon size={13} />
                      Excluir
                    </button>
                  ) : <span />}

                  <div className={styles.actionGroup}>
                    <button type="button" className={styles.secondaryButton} onClick={onClose}>
                      Fechar
                    </button>
                    {canEditClient ? (
                      <button type="submit" className={styles.primaryButton} disabled={saving}>
                        {saving ? 'Salvando...' : 'Salvar'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>
            </form>
          ) : (
            <section className={styles.analysisPanel}>
              <AnalysisTab clientId={client.id} type={currentAnalysis?.type || 'icp'} canEdit={canEditClient} />
            </section>
          )}
        </main>
      </section>
    </div>
  );
}
