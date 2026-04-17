// ================================================================
//  OverviewTab
//  Aba "Visão geral" do drawer — edição inline dos campos básicos
//  do cliente (PUT /clients/:id). Debounce em text inputs, commit
//  imediato em selects/dates.
//
//  Zona perigosa (exclusão) fica aqui porque é um controle "do
//  cliente como um todo", não de nenhuma sub-entidade.
// ================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { updateClient, deleteClient } from '../../api/clients.js';
import { ApiError } from '../../api/client.js';
import { fmtMoney } from '../../utils/format.js';
import { fmtDateBR } from '../../utils/clientHelpers.js';
import { useToast } from '../../context/ToastContext.jsx';
import { LogOutIcon } from '../ui/Icons.jsx';
import styles from './ClientDetailDrawer.module.css';

const DEBOUNCE_MS = 400;

function buildForm(c) {
  if (!c) {
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
    name: c.name || '',
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

function squadNameById(squads, id) {
  if (!id) return '';
  return squads.find((x) => x.id === id)?.name || '';
}

export default function OverviewTab({
  client,
  squads = [],
  canDelete = false,
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

  async function handleDelete() {
    if (!client?.id || deleting) return;
    setDeleting(true);
    try {
      await deleteClient(client.id);
      showToast('Cliente removido.', { variant: 'success' });
      onDeleted?.(client.id);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Erro ao remover cliente.';
      showToast(msg, { variant: 'error' });
      setDeleting(false);
    }
  }

  if (!client) return null;

  return (
    <>
      {/* Dados principais */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Dados principais</div>
        <div className={styles.grid}>
          <div className={`${styles.field} ${styles.full}`}>
            <label className={styles.label} htmlFor="cd-name">
              Nome {saving.name ? '· salvando…' : ''}
            </label>
            <input
              id="cd-name"
              className={styles.input}
              type="text"
              value={form.name}
              onChange={(e) => onTextChange('name', 'name', e.target.value)}
              disabled={deleting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="cd-squad">
              Squad {saving.squadId ? '· salvando…' : ''}
            </label>
            <select
              id="cd-squad"
              className={styles.select}
              value={form.squadId}
              onChange={(e) => onSelectChange('squadId', 'squadId', e.target.value)}
              disabled={deleting}
            >
              <option value="">Sem squad</option>
              {squads.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="cd-status">
              Status {saving.status ? '· salvando…' : ''}
            </label>
            <select
              id="cd-status"
              className={styles.select}
              value={form.status}
              onChange={(e) => onSelectChange('status', 'status', e.target.value)}
              disabled={deleting}
            >
              <option value="active">Ativo</option>
              <option value="churn">Churn / Cancelado</option>
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="cd-gestor">
              Gestor {saving.gestor ? '· salvando…' : ''}
            </label>
            <input
              id="cd-gestor"
              className={styles.input}
              type="text"
              value={form.gestor}
              onChange={(e) => onTextChange('gestor', 'gestor', e.target.value)}
              disabled={deleting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="cd-gdv">
              GDV {saving.gdvName ? '· salvando…' : ''}
            </label>
            <input
              id="cd-gdv"
              className={styles.input}
              type="text"
              value={form.gdvName}
              onChange={(e) => onTextChange('gdvName', 'gdvName', e.target.value)}
              disabled={deleting}
            />
          </div>
        </div>
      </div>

      {/* Contrato */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Contrato</div>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="cd-start">
              Início {saving.startDate ? '· salvando…' : ''}
            </label>
            <input
              id="cd-start"
              className={styles.input}
              type="date"
              value={form.startDate}
              onChange={(e) => onDateChange('startDate', 'startDate', e.target.value)}
              disabled={deleting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="cd-end">
              Término {saving.endDate ? '· salvando…' : ''}
            </label>
            <input
              id="cd-end"
              className={styles.input}
              type="date"
              value={form.endDate}
              onChange={(e) => onDateChange('endDate', 'endDate', e.target.value)}
              disabled={deleting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="cd-fee">
              Mensalidade (R$) {saving.fee ? '· salvando…' : ''}
            </label>
            <input
              id="cd-fee"
              className={styles.input}
              type="number"
              step="0.01"
              min="0"
              value={form.fee}
              onChange={(e) =>
                onTextChange('fee', 'fee', e.target.value, { number: true })
              }
              disabled={deleting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="cd-meta">
              Meta de lucro {saving.metaLucro ? '· salvando…' : ''}
            </label>
            <input
              id="cd-meta"
              className={styles.input}
              type="number"
              step="1"
              min="0"
              value={form.metaLucro}
              onChange={(e) =>
                onTextChange('metaLucro', 'metaLucro', e.target.value, { number: true })
              }
              disabled={deleting}
            />
          </div>
        </div>
      </div>

      {/* Metadados */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Metadados</div>
        <dl className={styles.metaList}>
          <dt>Squad atual</dt>
          <dd>{squadNameById(squads, client.squadId) || '—'}</dd>
          <dt>Mensalidade</dt>
          <dd>{fmtMoney(client.fee || 0)}</dd>
          <dt>Meta de lucro</dt>
          <dd>{client.metaLucro || 0} contratos</dd>
          <dt>Início</dt>
          <dd>{fmtDateBR(client.startDate)}</dd>
          <dt>Término</dt>
          <dd>{fmtDateBR(client.endDate)}</dd>
          {client.churnDate ? (
            <>
              <dt>Data de churn</dt>
              <dd>{fmtDateBR(client.churnDate)}</dd>
            </>
          ) : null}
          <dt>Goal status</dt>
          <dd>
            {client.goalStatus === 'vai'
              ? 'Vai bater'
              : client.goalStatus === 'nao'
              ? 'Em risco'
              : '—'}
          </dd>
        </dl>
      </div>

      {/* Zona perigosa */}
      {canDelete && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Zona perigosa</div>
          {confirmingDelete ? (
            <div className={styles.confirmBar}>
              <div className={styles.confirmText}>
                Remover <strong>{client.name}</strong>? Esta ação é irreversível
                e também apaga onboarding, métricas e análises vinculadas.
              </div>
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnDanger}`}
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Removendo…' : 'Confirmar exclusão'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={() => setConfirmingDelete(true)}
              style={{ alignSelf: 'flex-start' }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <LogOutIcon size={13} />
                Excluir cliente
              </span>
            </button>
          )}
        </div>
      )}
    </>
  );
}
