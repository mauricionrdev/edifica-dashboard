import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import Select from '../components/ui/Select.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { hasPermission } from '../utils/permissions.js';
import {
  createSupportDailyRow,
  createSupportTask,
  deleteSupportDailyRow,
  listSupportDailyRows,
  listSupportTasks,
  updateSupportDailyRow,
} from '../api/support.js';
import { BotIcon, CalendarIcon, CloseIcon, PlusIcon, SaveIcon, TrashIcon } from '../components/ui/Icons.jsx';
import styles from './SupportTechnologyPage.module.css';

const DAILY_COLUMNS = [
  { key: 'clientName', label: 'Cliente / Escritório', type: 'text', min: 260 },
  { key: 'implementationStatus', label: 'Implementação', type: 'select', options: ['Implementado com sucesso.', 'Em implementação', 'Pendente', 'Ajustar'] },
  { key: 'niche', label: 'Nicho / Campanha', type: 'text' },
  { key: 'promptStatus', label: 'Prompt', type: 'select', options: ['Prompt OK', 'Sem/Prompt', 'Revisar', 'Pendente'] },
  { key: 'connectionStatus', label: 'Conexão', type: 'select', options: ['Conectado', 'Desconectado', 'Desconectado (GDV)', 'Pendente'] },
  { key: 'accessStatus', label: 'Acessos', type: 'select', options: ['Acesso OK', 'Acessos OK', 'Sem/Acesso', 'Pendente'] },
  { key: 'activityStatus', label: 'Status', type: 'select', options: ['Ativo', 'INATIVO', 'Pausado'] },
  { key: 'apiKey', label: 'API Key', type: 'text', min: 220 },
  { key: 'notes', label: 'Observações', type: 'text', min: 220 },
];

const PRIORITIES = [
  { value: 'medium', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
  { value: 'low', label: 'Baixa' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function statusTone(value = '') {
  const normalized = String(value).toLowerCase();
  if (normalized.includes('desconect') || normalized.includes('sem/') || normalized.includes('inativo')) return 'danger';
  if (normalized.includes('pendente') || normalized.includes('revisar') || normalized.includes('ajustar')) return 'warning';
  if (normalized.includes('ok') || normalized.includes('conectado') || normalized.includes('ativo') || normalized.includes('sucesso')) return 'success';
  return 'neutral';
}

function normalizeRow(row) {
  return DAILY_COLUMNS.reduce((acc, column) => ({ ...acc, [column.key]: row?.[column.key] || '' }), {
    id: row?.id || '',
    position: Number(row?.position || 0),
  });
}

function SupportCell({ row, column, editable, saving, onChange, onCommit }) {
  const value = row[column.key] || '';
  const commonProps = {
    disabled: !editable || saving,
    value,
    onChange: (event) => onChange(row.id, column.key, event.target.value),
    onBlur: () => onCommit(row.id, column.key),
    onKeyDown: (event) => {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') event.currentTarget.blur();
    },
  };

  if (!editable) {
    return <span className={styles.readonlyCell} data-tone={statusTone(value)}>{value || '—'}</span>;
  }

  if (column.type === 'select') {
    return (
      <select className={styles.sheetSelect} {...commonProps}>
        <option value="">—</option>
        {column.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }

  return <input className={styles.sheetInput} type="text" {...commonProps} />;
}

export default function SupportTechnologyPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { clients = [], setPanelHeader } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [savingCell, setSavingCell] = useState('');
  const [creatingRow, setCreatingRow] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [demandModalOpen, setDemandModalOpen] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    priority: 'medium',
    clientId: '',
    dueDate: todayIso(),
    description: '',
  });

  const canEditBoard = hasPermission(user, 'support.board.edit');
  useEffect(() => {
    setPanelHeader?.({ title: 'Suporte de tecnologia', description: null, actions: null });
  }, [setPanelHeader]);

  const refreshRows = useCallback(async () => {
    setRowsLoading(true);
    try {
      const data = await listSupportDailyRows();
      setRows((Array.isArray(data?.rows) ? data.rows : []).map(normalizeRow));
    } finally {
      setRowsLoading(false);
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    const data = await listSupportTasks();
    setTasks(Array.isArray(data?.tasks) ? data.tasks : []);
  }, []);

  useEffect(() => {
    refreshRows().catch(() => showToast?.({ type: 'error', message: 'Não foi possível carregar a programação diária.' }));
    refreshTasks().catch(() => showToast?.({ type: 'error', message: 'Não foi possível carregar as demandas de suporte.' }));
  }, [refreshRows, refreshTasks, showToast]);

  const metrics = useMemo(() => {
    const openTasks = tasks.filter((task) => task.status !== 'done' && task.status !== 'canceled');
    const riskRows = rows.filter((row) => ['connectionStatus', 'accessStatus', 'promptStatus'].some((key) => statusTone(row[key]) === 'danger'));
    return {
      rows: rows.length,
      openTasks: openTasks.length,
      risks: riskRows.length,
      implemented: rows.filter((row) => statusTone(row.implementationStatus) === 'success').length,
    };
  }, [rows, tasks]);

  const handleCreateTask = async (event) => {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      showToast?.({ type: 'warning', message: 'Informe o título da demanda.' });
      return;
    }
    setCreatingTask(true);
    try {
      await createSupportTask(draft);
      setDraft({ title: '', priority: 'medium', clientId: '', dueDate: todayIso(), description: '' });
      setDemandModalOpen(false);
      await refreshTasks();
      showToast?.({ type: 'success', message: 'Demanda enviada para o suporte.' });
    } catch (err) {
      showToast?.({ type: 'error', message: err?.message || 'Não foi possível criar a demanda.' });
    } finally {
      setCreatingTask(false);
    }
  };

  const handleAddRow = async () => {
    setCreatingRow(true);
    try {
      const data = await createSupportDailyRow({
        implementationStatus: 'Implementado com sucesso.',
        promptStatus: 'Prompt OK',
        connectionStatus: 'Conectado',
        accessStatus: 'Acesso OK',
        activityStatus: 'Ativo',
      });
      setRows((current) => [...current, normalizeRow(data?.row)]);
    } catch (err) {
      showToast?.({ type: 'error', message: err?.message || 'Não foi possível adicionar linha.' });
    } finally {
      setCreatingRow(false);
    }
  };

  const handleDeleteRow = async (id) => {
    if (!id) return;
    await deleteSupportDailyRow(id);
    setRows((current) => current.filter((row) => row.id !== id));
  };

  const handleCellChange = (id, key, value) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  };

  const handleCellCommit = async (id, key) => {
    const row = rows.find((entry) => entry.id === id);
    if (!row) return;
    const savingKey = `${id}:${key}`;
    setSavingCell(savingKey);
    try {
      const data = await updateSupportDailyRow(id, { [key]: row[key] || '' });
      if (data?.row) {
        setRows((current) => current.map((entry) => (entry.id === id ? normalizeRow(data.row) : entry)));
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err?.message || 'Não foi possível salvar a célula.' });
      refreshRows().catch(() => {});
    } finally {
      setSavingCell('');
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Operação de suporte</span>
          <h1>Suporte de tecnologia</h1>
        </div>
        <div className={styles.heroActions}>
          <Button type="button" size="sm" onClick={() => setDemandModalOpen(true)}>
            <PlusIcon size={14} /> Nova demanda
          </Button>
          <div className={styles.heroIcon}><BotIcon size={22} /></div>
        </div>
      </section>

      <section className={styles.kpis}>
        <div><span>Clientes na programação</span><strong>{metrics.rows}</strong></div>
        <div><span>Demandas abertas</span><strong>{metrics.openTasks}</strong></div>
        <div><span>Pontos de atenção</span><strong>{metrics.risks}</strong></div>
        <div><span>Implementados</span><strong>{metrics.implemented}</strong></div>
      </section>

      {demandModalOpen ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setDemandModalOpen(false)}>
          <form className={styles.demandModal} onSubmit={handleCreateTask} role="dialog" aria-modal="true" aria-label="Nova demanda" onClick={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <div>
                <h2>Nova demanda</h2>
                <span>Suporte</span>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setDemandModalOpen(false)} aria-label="Fechar"><CloseIcon size={18} /></button>
            </header>
            <div className={styles.modalBody}>
              <div className={styles.modalGrid}>
                <div className={styles.modalField}>
                  <span>Prioridade</span>
                  <Select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))} disabled={creatingTask}>
                    {PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
                  </Select>
                </div>
                <label className={`${styles.modalField} ${styles.modalFieldTitle}`}>
                  <span>Título</span>
                  <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Título" disabled={creatingTask} />
                </label>
                <div className={styles.modalField}>
                  <span>Cliente</span>
                  <Select value={draft.clientId} onChange={(event) => setDraft((current) => ({ ...current, clientId: event.target.value }))} disabled={creatingTask} type="client" placeholder="Sem cliente">
                    <option value="">Sem cliente</option>
                    {clients.map((client) => <option key={client.id} value={client.id} data-avatar={client.avatarUrl || ''} data-name={client.name}>{client.name}</option>)}
                  </Select>
                </div>
                <label className={styles.modalField}>
                  <span>Prazo</span>
                  <input type="date" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} disabled={creatingTask} />
                </label>
                <label className={`${styles.modalField} ${styles.modalFieldFull}`}>
                  <span>Descrição</span>
                  <textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Descrição" disabled={creatingTask} />
                </label>
              </div>
            </div>
            <footer className={styles.modalFooter}>
              <Button type="button" variant="ghost" onClick={() => setDemandModalOpen(false)} disabled={creatingTask}>Cancelar</Button>
              <Button type="submit" disabled={creatingTask || !draft.title.trim()}><PlusIcon size={14} /> Criar demanda</Button>
            </footer>
          </form>
        </div>
      ) : null}

      <section className={styles.sheetPanel}>
        <header className={styles.sheetHeader}>
          <div>
            <h2><CalendarIcon size={16} /> Programação diária</h2>
          </div>
          {canEditBoard ? (
            <Button size="sm" onClick={handleAddRow} disabled={creatingRow}><PlusIcon size={14} /> Nova linha</Button>
          ) : (
            <span className={styles.viewOnly}>Somente visualização</span>
          )}
        </header>
        <div className={styles.sheetScroller}>
          <table className={styles.sheetTable}>
            <colgroup>
              <col className={styles.indexCol} />
              {DAILY_COLUMNS.map((column) => <col key={column.key} style={{ minWidth: column.min || 160 }} />)}
              {canEditBoard ? <col className={styles.actionCol} /> : null}
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                {DAILY_COLUMNS.map((column) => <th key={column.key}>{column.label}</th>)}
                {canEditBoard ? <th>Ação</th> : null}
              </tr>
            </thead>
            <tbody>
              {rowsLoading ? (
                <tr><td colSpan={DAILY_COLUMNS.length + (canEditBoard ? 2 : 1)} className={styles.sheetEmpty}>Carregando programação...</td></tr>
              ) : null}
              {!rowsLoading && rows.length === 0 ? (
                <tr><td colSpan={DAILY_COLUMNS.length + (canEditBoard ? 2 : 1)} className={styles.sheetEmpty}>Nenhum cliente na programação diária.</td></tr>
              ) : null}
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td className={styles.rowIndex}>{index + 1}</td>
                  {DAILY_COLUMNS.map((column) => (
                    <td key={column.key} data-column={column.key}>
                      <SupportCell
                        row={row}
                        column={column}
                        editable={canEditBoard}
                        saving={savingCell === `${row.id}:${column.key}`}
                        onChange={handleCellChange}
                        onCommit={handleCellCommit}
                      />
                    </td>
                  ))}
                  {canEditBoard ? (
                    <td className={styles.actionCell}>
                      <button type="button" onClick={() => handleDeleteRow(row.id)} title="Remover linha"><TrashIcon size={14} /></button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className={styles.sheetFooter}>
          <span>{rows.length} registros</span>
          {savingCell ? <span><SaveIcon size={14} /> Salvando</span> : null}
        </footer>
      </section>
    </div>
  );
}
