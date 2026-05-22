import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import DemandModal from '../components/tasks/DemandModal.jsx';
import { BotIcon, CalendarIcon, CloseIcon, PlusIcon, SaveIcon, TrashIcon } from '../components/ui/Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { createTaskAttachment } from '../api/projects.js';
import {
  createSupportDailyColumn,
  createSupportDailyRow,
  createSupportTask,
  deleteSupportDailyColumn,
  deleteSupportDailyRow,
  listSupportDailyRows,
  listSupportTasks,
  updateSupportDailyColumn,
  updateSupportDailyRow,
} from '../api/support.js';
import { hasPermission } from '../utils/permissions.js';
import styles from './SupportTechnologyPage.module.css';

const FALLBACK_DAILY_COLUMNS = [
  { key: 'clientName', label: 'Cliente / Escritório', width: 340, system: true },
  { key: 'implementationStatus', label: 'Implementação', width: 230, system: true },
  { key: 'niche', label: 'Nicho / Campanha', width: 210, system: true },
  { key: 'promptStatus', label: 'Prompt', width: 170, system: true },
  { key: 'connectionStatus', label: 'Conexão', width: 190, system: true },
  { key: 'accessStatus', label: 'Acessos', width: 160, system: true },
  { key: 'activityStatus', label: 'Status', width: 130, system: true },
  { key: 'apiKey', label: 'API Key', width: 290, system: true },
  { key: 'notes', label: 'Observações', width: 280, system: true },
];

const SUPPORT_ROLES = new Set(['suporte_tecnologia']);
const FALLBACK_SUPPORT_ROLES = new Set(['ceo', 'admin']);

function cleanText(value) {
  return String(value ?? '').trim();
}

function statusTone(value = '') {
  const normalized = String(value).toLowerCase();
  if (normalized.includes('desconect') || normalized.includes('sem/') || normalized.includes('inativo')) return 'danger';
  if (normalized.includes('pendente') || normalized.includes('revisar') || normalized.includes('ajustar')) return 'warning';
  if (normalized.includes('ok') || normalized.includes('conectado') || normalized.includes('ativo') || normalized.includes('sucesso')) return 'success';
  return 'neutral';
}

function normalizeColumns(columns = []) {
  const source = Array.isArray(columns) && columns.length ? columns : FALLBACK_DAILY_COLUMNS;
  return source.map((column) => ({
    key: column.key,
    label: column.label || 'Coluna',
    width: Math.max(90, Math.min(720, Number(column.width || 180))),
    system: column.system !== false,
  }));
}

function normalizeRow(row = {}, columns = FALLBACK_DAILY_COLUMNS) {
  const base = columns.reduce((acc, column) => ({ ...acc, [column.key]: row?.[column.key] || '' }), {});
  return {
    id: row?.id || '',
    position: Number(row?.position || 0),
    ...base,
  };
}

function SupportCell({ row, column, editable, saving, onChange, onCommit }) {
  const value = row[column.key] || '';
  if (!editable) {
    return <span className={styles.readonlyCell} data-tone={statusTone(value)} title={value}>{value || '—'}</span>;
  }
  return (
    <input
      className={styles.sheetInput}
      data-tone={statusTone(value)}
      type="text"
      spellCheck={false}
      disabled={saving}
      value={value}
      onChange={(event) => onChange(row.id, column.key, event.target.value)}
      onBlur={() => onCommit(row.id, column.key)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') event.currentTarget.blur();
      }}
    />
  );
}

function HeaderCell({ column, editable, onLabelChange, onLabelCommit, onResizeStart, onDelete }) {
  return (
    <div className={styles.headerCellInner}>
      {editable ? (
        <input
          value={column.label}
          onChange={(event) => onLabelChange(column.key, event.target.value)}
          onBlur={() => onLabelCommit(column.key)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') event.currentTarget.blur();
          }}
          aria-label={`Nome da coluna ${column.label}`}
        />
      ) : (
        <span>{column.label}</span>
      )}
      {editable && !column.system ? (
        <button type="button" onClick={() => onDelete(column.key)} aria-label={`Remover coluna ${column.label}`}>
          <CloseIcon size={11} />
        </button>
      ) : null}
      {editable ? (
        <span
          className={styles.resizeHandle}
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(event) => onResizeStart(event, column.key)}
        />
      ) : null}
    </div>
  );
}

export default function SupportTechnologyPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { clients = [], userDirectory = [], setPanelHeader } = useOutletContext();
  const [columns, setColumns] = useState(FALLBACK_DAILY_COLUMNS);
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [savingCell, setSavingCell] = useState('');
  const [savingColumn, setSavingColumn] = useState('');
  const [creatingRow, setCreatingRow] = useState(false);
  const [creatingColumn, setCreatingColumn] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [demandModalOpen, setDemandModalOpen] = useState(false);
  const resizeRef = useRef(null);

  const activeUsers = useMemo(() => (
    Array.isArray(userDirectory) ? userDirectory : []
  ).filter((item) => item?.id && item?.active !== false), [userDirectory]);

  const supportUsers = useMemo(() => {
    const direct = activeUsers.filter((item) => SUPPORT_ROLES.has(item.role));
    if (direct.length) return direct;
    const fallback = activeUsers.filter((item) => FALLBACK_SUPPORT_ROLES.has(item.role));
    return fallback.length ? fallback : activeUsers;
  }, [activeUsers]);

  const defaultAssigneeId = useMemo(() => {
    const currentAsSupport = supportUsers.find((item) => item.id === user?.id);
    return currentAsSupport?.id || supportUsers[0]?.id || user?.id || '';
  }, [supportUsers, user?.id]);

  const canEditBoard = hasPermission(user, 'support.board.edit');
  const canCreateDemand = hasPermission(user, 'support.view');

  useEffect(() => {
    setPanelHeader?.({ title: 'Suporte de tecnologia', description: null, actions: null });
  }, [setPanelHeader]);

  const refreshRows = useCallback(async () => {
    setRowsLoading(true);
    try {
      const data = await listSupportDailyRows();
      const nextColumns = normalizeColumns(data?.columns);
      setColumns(nextColumns);
      setRows((Array.isArray(data?.rows) ? data.rows : []).map((row) => normalizeRow(row, nextColumns)));
    } finally {
      setRowsLoading(false);
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    const data = await listSupportTasks();
    setTasks(Array.isArray(data?.tasks) ? data.tasks : []);
  }, []);

  useEffect(() => {
    refreshRows().catch(() => showToast('Não foi possível carregar a programação diária.', { variant: 'error' }));
    refreshTasks().catch(() => showToast('Não foi possível carregar as demandas de suporte.', { variant: 'error' }));
  }, [refreshRows, refreshTasks, showToast]);

  const metrics = useMemo(() => {
    const openTasks = tasks.filter((task) => task.status !== 'done' && task.status !== 'canceled');
    const riskRows = rows.filter((row) => columns.some((column) => statusTone(row[column.key]) === 'danger'));
    return {
      rows: rows.length,
      openTasks: openTasks.length,
      risks: riskRows.length,
      implemented: rows.filter((row) => statusTone(row.implementationStatus) === 'success').length,
    };
  }, [columns, rows, tasks]);

  const handleCreateTask = async (form) => {
    const title = cleanText(form.title);
    if (!title) {
      showToast('Informe o título da demanda.', { variant: 'warning' });
      return;
    }
    setCreatingTask(true);
    try {
      const data = await createSupportTask({
        title,
        type: form.type,
        priority: form.priority,
        clientId: form.clientId,
        assigneeUserId: form.assigneeUserId || defaultAssigneeId,
        collaboratorUserIds: form.collaboratorUserIds,
        dueDate: form.dueDate,
        description: form.description,
      });
      const taskId = data?.task?.id;
      if (taskId && form.attachments?.length) {
        await Promise.allSettled(form.attachments.map((item) => createTaskAttachment(taskId, {
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          dataUrl: item.dataUrl,
        })));
      }
      setDemandModalOpen(false);
      await refreshTasks();
      showToast('Demanda criada.');
    } catch (err) {
      showToast(err?.message || 'Não foi possível criar a demanda.', { variant: 'error' });
    } finally {
      setCreatingTask(false);
    }
  };

  const handleAddRow = async () => {
    setCreatingRow(true);
    try {
      const data = await createSupportDailyRow({});
      setRows((current) => [...current, normalizeRow(data?.row, columns)]);
    } catch (err) {
      showToast(err?.message || 'Não foi possível adicionar linha.', { variant: 'error' });
    } finally {
      setCreatingRow(false);
    }
  };

  const handleDeleteRow = async (id) => {
    if (!id) return;
    try {
      await deleteSupportDailyRow(id);
      setRows((current) => current.filter((row) => row.id !== id));
    } catch (err) {
      showToast(err?.message || 'Não foi possível remover a linha.', { variant: 'error' });
    }
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
        setRows((current) => current.map((entry) => (entry.id === id ? normalizeRow(data.row, columns) : entry)));
      }
    } catch (err) {
      showToast(err?.message || 'Não foi possível salvar a célula.', { variant: 'error' });
      refreshRows().catch(() => {});
    } finally {
      setSavingCell('');
    }
  };

  const handleAddColumn = async () => {
    setCreatingColumn(true);
    try {
      const data = await createSupportDailyColumn({ label: 'Nova coluna', width: 180 });
      if (data?.column) {
        setColumns((current) => [...current, data.column]);
        setRows((current) => current.map((row) => ({ ...row, [data.column.key]: '' })));
      }
    } catch (err) {
      showToast(err?.message || 'Não foi possível adicionar coluna.', { variant: 'error' });
    } finally {
      setCreatingColumn(false);
    }
  };

  const handleColumnLabelChange = (key, label) => {
    setColumns((current) => current.map((column) => (column.key === key ? { ...column, label } : column)));
  };

  const handleColumnLabelCommit = async (key) => {
    const column = columns.find((entry) => entry.key === key);
    if (!column) return;
    setSavingColumn(key);
    try {
      const data = await updateSupportDailyColumn(key, { label: column.label || 'Coluna' });
      if (data?.columns) setColumns(normalizeColumns(data.columns));
    } catch (err) {
      showToast(err?.message || 'Não foi possível salvar a coluna.', { variant: 'error' });
      refreshRows().catch(() => {});
    } finally {
      setSavingColumn('');
    }
  };

  const handleDeleteColumn = async (key) => {
    const column = columns.find((entry) => entry.key === key);
    if (!column || column.system) return;
    try {
      await deleteSupportDailyColumn(key);
      setColumns((current) => current.filter((entry) => entry.key !== key));
      setRows((current) => current.map((row) => {
        const next = { ...row };
        delete next[key];
        return next;
      }));
    } catch (err) {
      showToast(err?.message || 'Não foi possível remover a coluna.', { variant: 'error' });
    }
  };

  const handleResizeStart = (event, key) => {
    event.preventDefault();
    const column = columns.find((entry) => entry.key === key);
    if (!column) return;
    resizeRef.current = { key, startX: event.clientX, startWidth: column.width };
    document.body.style.cursor = 'col-resize';
  };

  useEffect(() => {
    function handleMove(event) {
      const state = resizeRef.current;
      if (!state) return;
      const width = Math.max(90, Math.min(720, state.startWidth + event.clientX - state.startX));
      setColumns((current) => current.map((column) => (column.key === state.key ? { ...column, width } : column)));
    }
    async function handleUp() {
      const state = resizeRef.current;
      if (!state) return;
      resizeRef.current = null;
      document.body.style.cursor = '';
      const column = columns.find((entry) => entry.key === state.key);
      if (!column) return;
      try {
        await updateSupportDailyColumn(column.key, { width: column.width });
      } catch {
        refreshRows().catch(() => {});
      }
    }
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
    };
  }, [columns, refreshRows]);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroTitle}>
          <span className={styles.eyebrow}>Operação de suporte</span>
          <h1>Suporte de tecnologia</h1>
        </div>
        <div className={styles.heroActions}>
          {canCreateDemand ? (
            <Button type="button" size="sm" onClick={() => setDemandModalOpen(true)}>
              <PlusIcon size={14} /> Nova demanda
            </Button>
          ) : null}
          <span className={styles.heroIcon} aria-hidden="true"><BotIcon size={18} /></span>
        </div>
      </section>

      <section className={styles.kpis}>
        <div><span>Clientes na programação</span><strong>{metrics.rows}</strong></div>
        <div><span>Demandas abertas</span><strong>{metrics.openTasks}</strong></div>
        <div><span>Pontos de atenção</span><strong>{metrics.risks}</strong></div>
        <div><span>Implementados</span><strong>{metrics.implemented}</strong></div>
      </section>

      <section className={styles.sheetPanel}>
        <header className={styles.sheetHeader}>
          <h2><CalendarIcon size={15} /> Programação diária</h2>
          {canEditBoard ? (
            <div className={styles.sheetActions}>
              <Button type="button" size="sm" onClick={handleAddColumn} disabled={creatingColumn}>
                <PlusIcon size={14} /> Nova coluna
              </Button>
              <Button type="button" size="sm" onClick={handleAddRow} disabled={creatingRow}>
                <PlusIcon size={14} /> Nova linha
              </Button>
            </div>
          ) : null}
        </header>

        <div className={styles.sheetScroller}>
          <table className={styles.sheetTable}>
            <colgroup>
              <col style={{ width: 46 }} />
              {columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}
              {canEditBoard ? <col style={{ width: 58 }} /> : null}
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                {columns.map((column) => (
                  <th key={column.key} data-saving={savingColumn === column.key || undefined}>
                    <HeaderCell
                      column={column}
                      editable={canEditBoard}
                      onLabelChange={handleColumnLabelChange}
                      onLabelCommit={handleColumnLabelCommit}
                      onResizeStart={handleResizeStart}
                      onDelete={handleDeleteColumn}
                    />
                  </th>
                ))}
                {canEditBoard ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rowsLoading ? (
                <tr><td colSpan={columns.length + (canEditBoard ? 2 : 1)} className={styles.sheetEmpty}>Carregando</td></tr>
              ) : null}
              {!rowsLoading && rows.length === 0 ? (
                <tr><td colSpan={columns.length + (canEditBoard ? 2 : 1)} className={styles.sheetEmpty}>Sem registros.</td></tr>
              ) : null}
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td className={styles.rowIndex}>{index + 1}</td>
                  {columns.map((column) => (
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
                      <button type="button" onClick={() => handleDeleteRow(row.id)} title="Remover linha"><TrashIcon size={13} /></button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className={styles.sheetFooter}>
          <span>{rows.length} registros</span>
          {savingCell || savingColumn ? <span><SaveIcon size={13} /> Salvando</span> : null}
        </footer>
      </section>

      <DemandModal
        open={demandModalOpen}
        title="Nova demanda"
        defaultType="support"
        defaultAssigneeUserId={defaultAssigneeId}
        assigneeUsers={supportUsers}
        users={activeUsers}
        clients={clients}
        creating={creatingTask}
        onClose={() => !creatingTask && setDemandModalOpen(false)}
        onSubmit={handleCreateTask}
        onError={(message) => showToast(message, { variant: 'warning' })}
      />
    </div>
  );
}
