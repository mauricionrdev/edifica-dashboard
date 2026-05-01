import { useEffect, useMemo, useState } from 'react';
import { createClient, updateClient } from '../../api/clients.js';
import { ApiError } from '../../api/client.js';
import { CameraIcon, CloseIcon } from '../ui/Icons.jsx';
import Select from '../ui/Select.jsx';
import UserPicker from '../users/UserPicker.jsx';
import DateField from '../ui/DateField.jsx';
import { clientInitials } from '../../utils/clientHelpers.js';
import {
  getClientAvatar,
  readAvatarFile,
  saveClientAvatar,
} from '../../utils/avatarStorage.js';
import { formatLocaleNumber, parseLocaleNumber } from '../../utils/number.js';
import { gdvOptions, gestorOptions, userLabel } from '../../utils/responsibleUsers.js';
import styles from './ClientFormModal.module.css';

const EMPTY = {
  name: '',
  avatarUrl: '',
  squadId: '',
  gdvName: '',
  gestor: '',
  status: 'active',
  fee: '',
  metaLucro: '',
  startDate: '',
  endDate: '',
};

function toPayload(form) {
  return {
    name: form.name.trim(),
    avatarUrl: form.avatarUrl || '',
    squadId: form.squadId || null,
    gdvName: form.gdvName.trim(),
    gestor: form.gestor.trim(),
    status: form.status === 'churn' ? 'churn' : 'active',
    fee: parseLocaleNumber(form.fee, 0),
    metaLucro: parseLocaleNumber(form.metaLucro, 0),
    startDate: form.startDate || null,
    endDate: form.endDate || null,
  };
}

function fromClient(client) {
  if (!client) return EMPTY;
  return {
    name: client.name || '',
    avatarUrl: client.avatarUrl || '',
    squadId: client.squadId || '',
    gdvName: client.gdvName || '',
    gestor: client.gestor || '',
    status: client.status === 'churn' ? 'churn' : 'active',
    fee: client.fee != null ? formatLocaleNumber(client.fee, '') : '',
    metaLucro: client.metaLucro != null ? formatLocaleNumber(client.metaLucro, '') : '',
    startDate: client.startDate || '',
    endDate: client.endDate || '',
  };
}

export default function ClientFormModal({
  mode = 'create',
  client = null,
  squads = [],
  users = [],
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(() => (mode === 'edit' ? fromClient(client) : EMPTY));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(() =>
    mode === 'edit' ? getClientAvatar(client) : ''
  );

  useEffect(() => {
    setForm(mode === 'edit' ? fromClient(client) : EMPTY);
    setAvatarPreview(mode === 'edit' ? getClientAvatar(client) : '');
    setError('');
  }, [mode, client]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = useMemo(() => (mode === 'edit' ? 'Editar cliente' : 'Novo cliente'), [mode]);
  const gestorRows = useMemo(() => gestorOptions(users, form.gestor), [users, form.gestor]);
  const gdvRows = useMemo(() => gdvOptions(users, form.gdvName), [users, form.gdvName]);

  function setField(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }));
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
    if (!file) return;
    try {
      const nextAvatar = await readAvatarFile(file);
      setAvatarPreview(nextAvatar);
      setForm((previous) => ({ ...previous, avatarUrl: nextAvatar }));
    } catch (nextError) {
      setError(nextError?.message || 'Não foi possível usar esta imagem.');
    }
  }

  async function handleSubmit(event) {
    event?.preventDefault?.();
    if (saving) return;

    if (!form.name.trim()) {
      setError('Informe o nome do cliente.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      const payload = toPayload(form);
      const response =
        mode === 'edit'
          ? await updateClient(client.id, payload)
          : await createClient(payload);

      const savedClient = response?.client || client;
      if (savedClient?.id) {
        saveClientAvatar(savedClient, savedClient.avatarUrl || payload.avatarUrl || '');
      }
      onSaved?.(response?.client);
    } catch (nextError) {
      if (nextError instanceof ApiError) {
        setError(nextError.message || 'Não foi possível salvar o cliente.');
      } else {
        setError('Erro inesperado. Tente novamente.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <form
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-form-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className={styles.header}>
          <h2 id="client-form-title" className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className={styles.body}>
          <section className={styles.section}>
            <div className={styles.sectionTitle}>Identificação</div>
            <div className={styles.avatarUpload}>
              <div
                className={styles.avatarPreview}
                aria-hidden="true"
              >
                {avatarPreview ? <img src={avatarPreview} alt="" /> : clientInitials(form.name)}
              </div>
              <div className={styles.avatarUploadText}>
                <strong>Foto do cliente</strong>
                <span>Opcional</span>
              </div>
              <label
                className={styles.avatarUploadButton}
                aria-label="Escolher imagem"
                title="Escolher imagem"
              >
                <CameraIcon size={14} />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFile}
                  disabled={saving}
                />
              </label>
            </div>

            <div className={styles.grid}>
              <div className={`${styles.field} ${styles.full}`}>
                <label className={styles.label} htmlFor="nc-name">
                  Nome do cliente
                </label>
                <input
                  id="nc-name"
                  className={styles.input}
                  type="text"
                  maxLength={120}
                  value={form.name}
                  onChange={(event) => setField('name', event.target.value)}
                  disabled={saving}
                  autoFocus
                  placeholder="Nome completo"
                />
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Squad</span>
                <Select
                  className={styles.selectControl}
                  value={form.squadId}
                  onChange={(event) => setField('squadId', event.target.value)}
                  disabled={saving}
                  placeholder="Selecionar squad"
                  aria-label="Squad"
                >
                  <option value="">Sem squad</option>
                  {squads.map((squad) => (
                    <option key={squad.id} value={squad.id}>
                      {squad.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Status</span>
                <Select
                  className={styles.selectControl}
                  value={form.status}
                  onChange={(event) => setField('status', event.target.value)}
                  disabled={saving}
                  placeholder="Selecionar status"
                  aria-label="Status"
                >
                  <option value="active">Ativo</option>
                  <option value="churn">Churn / Cancelado</option>
                </Select>
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Gestor de tráfego</span>
                <UserPicker
                  className={styles.selectControl}
                  users={gestorRows}
                  value={gestorRows.find((entry) => entry.name === form.gestor)?.id || ''}
                  onChange={(userId) => setField('gestor', gestorRows.find((entry) => entry.id === userId)?.name || '')}
                  disabled={saving}
                  placeholder="Sem gestor"
                  disableHover
                  portal
                />
              </div>

              <div className={styles.field}>
                <span className={styles.label}>GDV responsável</span>
                <UserPicker
                  className={styles.selectControl}
                  users={gdvRows}
                  value={gdvRows.find((entry) => entry.name === form.gdvName)?.id || ''}
                  onChange={(userId) => setField('gdvName', gdvRows.find((entry) => entry.id === userId)?.name || '')}
                  disabled={saving}
                  placeholder="Sem GDV"
                  disableHover
                  portal
                />
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>Contrato</div>
            <div className={styles.grid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="nc-start">
                  Início
                </label>
                <DateField
                  id="nc-start"
                  value={form.startDate}
                  onChange={(value) => setField('startDate', value)}
                  disabled={saving}
                  ariaLabel="Data de início"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="nc-end">
                  Término
                </label>
                <DateField
                  id="nc-end"
                  value={form.endDate}
                  onChange={(value) => setField('endDate', value)}
                  disabled={saving}
                  ariaLabel="Data de término"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="nc-fee">
                  Mensalidade base (R$)
                </label>
                <input
                  id="nc-fee"
                  className={styles.input}
                  type="text"
                  inputMode="decimal"
                  value={form.fee}
                  onChange={(event) => setField('fee', event.target.value)}
                  onBlur={() => normalizeNumberField('fee')}
                  disabled={saving}
                  placeholder="R$ 0,00"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="nc-meta">
                  Meta base
                </label>
                <input
                  id="nc-meta"
                  className={styles.input}
                  type="text"
                  inputMode="decimal"
                  value={form.metaLucro}
                  onChange={(event) => setField('metaLucro', event.target.value)}
                  onBlur={() => normalizeNumberField('metaLucro')}
                  disabled={saving}
                  placeholder="0"
                />
              </div>

              {error ? <div className={styles.errorLine}>{error}</div> : null}
            </div>
          </section>
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button type="submit" className={styles.btnPrimary} disabled={saving}>
            {saving ? 'Salvando...' : mode === 'edit' ? 'Salvar alterações' : 'Criar cliente'}
          </button>
        </div>
      </form>
    </div>
  );
}
