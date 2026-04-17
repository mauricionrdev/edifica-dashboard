// ================================================================
//  ClientFormModal
//  Modal único usado tanto para criar quanto para editar.
//   - mode="create": chama createClient(body)
//   - mode="edit":   chama updateClient(id, patch)
//
//  Campos refletem exatamente o que POST/PUT /clients aceitam no
//  backend (src/routes/clients.js#pickUpdatableFields):
//    name, squadId, gdvName, gestor, status, fee, metaLucro,
//    startDate, endDate.
//
//  ESC fecha. Submit via Enter no campo de nome.
// ================================================================

import { useEffect, useMemo, useState } from 'react';
import { createClient, updateClient } from '../../api/clients.js';
import { ApiError } from '../../api/client.js';
import { CloseIcon } from '../ui/Icons.jsx';
import styles from './ClientFormModal.module.css';

const EMPTY = {
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

function toPayload(form) {
  return {
    name: form.name.trim(),
    squadId: form.squadId || null,
    gdvName: form.gdvName.trim(),
    gestor: form.gestor.trim(),
    status: form.status === 'churn' ? 'churn' : 'active',
    fee: Number(form.fee) || 0,
    metaLucro: Number(form.metaLucro) || 0,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
  };
}

function fromClient(c) {
  if (!c) return EMPTY;
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

/**
 * Props:
 *  - mode: 'create' | 'edit'
 *  - client?: cliente (obrigatório no modo edit)
 *  - squads: lista de squads para o select
 *  - onClose(): fecha sem salvar
 *  - onSaved(client): chamado com o cliente retornado pela API
 */
export default function ClientFormModal({
  mode = 'create',
  client = null,
  squads = [],
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(() =>
    mode === 'edit' ? fromClient(client) : EMPTY
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reidrata o form se o cliente mudar (trocar de cliente sem desmontar)
  useEffect(() => {
    if (mode === 'edit') setForm(fromClient(client));
    else setForm(EMPTY);
    setError('');
  }, [mode, client]);

  // ESC fecha
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = useMemo(
    () => (mode === 'edit' ? 'Editar cliente' : 'Novo cliente'),
    [mode]
  );

  function setField(k, v) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    if (saving) return;

    const name = form.name.trim();
    if (!name) {
      setError('Informe o nome do cliente.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      const payload = toPayload(form);
      const res =
        mode === 'edit'
          ? await updateClient(client.id, payload)
          : await createClient(payload);
      onSaved?.(res?.client);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Não foi possível salvar o cliente.');
      } else {
        setError('Erro inesperado. Tente novamente.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={onClose}
    >
      <form
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-form-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className={styles.header}>
          <h2 id="client-form-title" className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Fechar"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.grid}>
            <div className={`${styles.field} ${styles.full}`}>
              <label className={styles.label} htmlFor="nc-name">
                Nome do cliente *
              </label>
              <input
                id="nc-name"
                className={styles.input}
                type="text"
                maxLength={120}
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                disabled={saving}
                autoFocus
                placeholder="Nome completo do cliente"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="nc-squad">
                Squad
              </label>
              <select
                id="nc-squad"
                className={styles.select}
                value={form.squadId}
                onChange={(e) => setField('squadId', e.target.value)}
                disabled={saving}
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
              <label className={styles.label} htmlFor="nc-status">
                Status
              </label>
              <select
                id="nc-status"
                className={styles.select}
                value={form.status}
                onChange={(e) => setField('status', e.target.value)}
                disabled={saving}
              >
                <option value="active">Ativo</option>
                <option value="churn">Churn / Cancelado</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="nc-gestor">
                Gestor de tráfego
              </label>
              <input
                id="nc-gestor"
                className={styles.input}
                type="text"
                value={form.gestor}
                onChange={(e) => setField('gestor', e.target.value)}
                disabled={saving}
                placeholder="Nome do gestor"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="nc-gdv">
                GDV responsável
              </label>
              <input
                id="nc-gdv"
                className={styles.input}
                type="text"
                value={form.gdvName}
                onChange={(e) => setField('gdvName', e.target.value)}
                disabled={saving}
                placeholder="Nome do GDV"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="nc-start">
                Data de início
              </label>
              <input
                id="nc-start"
                className={styles.input}
                type="date"
                value={form.startDate}
                onChange={(e) => setField('startDate', e.target.value)}
                disabled={saving}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="nc-end">
                Data de término / renovação
              </label>
              <input
                id="nc-end"
                className={styles.input}
                type="date"
                value={form.endDate}
                onChange={(e) => setField('endDate', e.target.value)}
                disabled={saving}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="nc-fee">
                Mensalidade (R$)
              </label>
              <input
                id="nc-fee"
                className={styles.input}
                type="number"
                step="0.01"
                min="0"
                value={form.fee}
                onChange={(e) => setField('fee', e.target.value)}
                disabled={saving}
                placeholder="0,00"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="nc-meta">
                Meta de lucro (contratos)
              </label>
              <input
                id="nc-meta"
                className={styles.input}
                type="number"
                step="1"
                min="0"
                value={form.metaLucro}
                onChange={(e) => setField('metaLucro', e.target.value)}
                disabled={saving}
                placeholder="0"
              />
            </div>

            {error && <div className={styles.errorLine}>{error}</div>}
          </div>
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
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={saving}
          >
            {saving
              ? 'Salvando…'
              : mode === 'edit'
              ? 'Salvar alterações'
              : 'Criar cliente'}
          </button>
        </div>
      </form>
    </div>
  );
}
