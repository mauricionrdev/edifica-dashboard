import { useEffect, useMemo, useState } from 'react';
import { createClient } from '../../api/clients.js';
import { ApiError } from '../../api/client.js';
import { clientInitials } from '../../utils/clientHelpers.js';
import { CLIENT_STATUS_OPTIONS, normalizeClientStatus } from '../../utils/clientStatus.js';
import {
  getSquadAvatar,
  readAvatarFile,
  saveClientAvatar,
} from '../../utils/avatarStorage.js';
import { formatLocaleNumber, parseLocaleNumber } from '../../utils/number.js';
import { gdvOptions, gestorOptions } from '../../utils/responsibleUsers.js';
import { CameraIcon, CloseIcon } from '../../components/ui/Icons.jsx';
import styles from './DesignLabClientCreateModal.module.css';

const INTERNAL_SELLER_OPTIONS = ['Michael', 'Camila'];

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
  contractType: 'recurring',
  internalCommercial: 'no',
  internalSeller: '',
};

function toPayload(form) {
  return {
    name: form.name.trim(),
    avatarUrl: form.avatarUrl || '',
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

export default function DesignLabClientCreateModal({
  squads = [],
  users = [],
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');

  const gestorRows = useMemo(
    () => roleSelectOptions(gestorOptions(users, form.gestor), form.gestor),
    [users, form.gestor]
  );
  const gdvRows = useMemo(
    () => roleSelectOptions(gdvOptions(users, form.gdvName), form.gdvName),
    [users, form.gdvName]
  );

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function setField(key, value) {
    setForm((previous) => {
      const next = { ...previous, [key]: value };
      if (key === 'internalCommercial' && value !== 'yes') {
        next.internalSeller = '';
      }
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
    event.preventDefault();
    if (saving) return;

    if (!form.name.trim()) {
      setError('Informe o nome do cliente.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = toPayload(form);
      const response = await createClient(payload);
      const savedClient = response?.client;

      if (savedClient?.id) {
        saveClientAvatar(savedClient, savedClient.avatarUrl || payload.avatarUrl || '');
      }

      onSaved?.(savedClient);
    } catch (nextError) {
      const message = nextError instanceof ApiError
        ? nextError.message
        : 'Erro inesperado ao criar cliente.';
      setError(message || 'Não foi possível criar o cliente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <form
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="design-lab-create-client-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header className={styles.header}>
          <div>
            <span className={styles.kicker}>Clientes</span>
            <h2 id="design-lab-create-client-title">Novo cliente</h2>
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Fechar">
            <CloseIcon size={16} />
          </button>
        </header>

        <main className={styles.body}>
          <section className={styles.identitySection} aria-label="Identificação">
            <div className={styles.avatarUploadRow}>
              <span className={styles.avatarPreview} aria-hidden="true">
                {avatarPreview ? <img src={avatarPreview} alt="" /> : clientInitials(form.name)}
              </span>

              <div className={styles.avatarMeta}>
                <strong>Logo do cliente</strong>
                <span>{avatarPreview ? 'Imagem selecionada' : 'PNG ou JPG'}</span>
              </div>

              <label className={styles.avatarUploadAction}>
                <CameraIcon size={13} />
                Selecionar
                <input type="file" accept="image/*" onChange={handleAvatarFile} disabled={saving} />
              </label>
            </div>

            <label className={styles.fieldFull}>
              <span>Nome do cliente</span>
              <input
                value={form.name}
                onChange={(event) => setField('name', event.target.value)}
                placeholder="Nome do cliente"
                maxLength={120}
                disabled={saving}
              />
            </label>
          </section>

          <section className={styles.formSection} aria-label="Operação">
            <div className={styles.sectionHeader}>
              <span>Operação</span>
            </div>

            <div className={styles.grid}>
              <label className={styles.field}>
                <span>Squad</span>
                <select
                  value={form.squadId}
                  onChange={(event) => setField('squadId', event.target.value)}
                  disabled={saving}
                >
                  <option value="">Sem squad</option>
                  {squads.map((squad) => (
                    <option key={squad.id} value={squad.id}>
                      {squad.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Status</span>
                <select
                  value={form.status}
                  onChange={(event) => setField('status', event.target.value)}
                  disabled={saving}
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
                  disabled={saving}
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
                  disabled={saving}
                >
                  <option value="">Sem GDV</option>
                  {gdvRows.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className={styles.formSection} aria-label="Comercial interno">
            <div className={styles.sectionHeader}>
              <span>Comercial interno</span>
            </div>

            <div className={styles.inlineGrid}>
              <label className={styles.field}>
                <span>Categoria</span>
                <select
                  value={form.internalCommercial}
                  onChange={(event) => setField('internalCommercial', event.target.value)}
                  disabled={saving}
                >
                  <option value="no">Não possui</option>
                  <option value="yes">Possui</option>
                </select>
              </label>

              {form.internalCommercial === 'yes' ? (
                <label className={styles.field}>
                  <span>Vendedor interno</span>
                  <input
                    type="text"
                    list="design-lab-internal-seller-options"
                    value={form.internalSeller}
                    onChange={(event) => setField('internalSeller', event.target.value)}
                    placeholder="Michael, Camila ou novo"
                    maxLength={80}
                    disabled={saving}
                  />
                  <datalist id="design-lab-internal-seller-options">
                    {INTERNAL_SELLER_OPTIONS.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </label>
              ) : null}
            </div>
          </section>

          <section className={styles.formSection} aria-label="Contrato">
            <div className={styles.sectionHeader}>
              <span>Contrato</span>
            </div>

            <div className={styles.contractGrid}>
              <label className={styles.field}>
                <span>Tipo</span>
                <select
                  value={form.contractType}
                  onChange={(event) => setField('contractType', event.target.value)}
                  disabled={saving}
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
                  placeholder="R$ 0,00"
                  inputMode="decimal"
                  disabled={saving}
                />
              </label>

              <label className={styles.field}>
                <span>Início</span>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setField('startDate', event.target.value)}
                  disabled={saving}
                />
              </label>

              <label className={styles.field}>
                <span>Término</span>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(event) => setField('endDate', event.target.value)}
                  disabled={saving}
                />
              </label>

              <label className={styles.fieldSmall}>
                <span>Meta base</span>
                <input
                  value={form.metaLucro}
                  onChange={(event) => setField('metaLucro', event.target.value)}
                  onBlur={() => normalizeNumberField('metaLucro')}
                  placeholder="0"
                  inputMode="decimal"
                  disabled={saving}
                />
              </label>
            </div>
          </section>

          {error ? <div className={styles.errorLine}>{error}</div> : null}
        </main>

        <footer className={styles.footer}>
          <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {saving ? 'Salvando...' : 'Criar cliente'}
          </button>
        </footer>
      </form>
    </div>
  );
}
