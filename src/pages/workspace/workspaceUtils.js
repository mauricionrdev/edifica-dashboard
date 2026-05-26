export const WORKSPACE_SECTIONS = [
  { id: 'home', icon: '⌘', label: 'Início', description: 'Visão operacional do dia.' },
  { id: 'inbox', icon: '↳', label: 'Caixa de entrada', description: 'Pendências sem triagem.' },
  { id: 'tasks', icon: '✓', label: 'Tarefas', description: 'Execução pessoal.' },
  { id: 'docs', icon: '¶', label: 'Documentos', description: 'Páginas e anotações.' },
  { id: 'sheets', icon: '▦', label: 'Planilhas', description: 'Dados em grade.' },
  { id: 'settings', icon: '⚙', label: 'Configurações', description: 'Preferências do espaço.' },
];

export const TEXT_COLORS = [
  { id: 'default', label: 'Padrão', value: 'var(--text-primary)' },
  { id: 'muted', label: 'Cinza', value: 'var(--text-secondary)' },
  { id: 'success', label: 'Verde', value: 'var(--success-text)' },
  { id: 'warning', label: 'Atenção', value: 'var(--warning-text)' },
  { id: 'danger', label: 'Vermelho', value: 'var(--danger-text)' },
  { id: 'info', label: 'Azul', value: 'var(--info-text)' },
];

export const FILL_COLORS = [
  { id: 'none', label: 'Sem preenchimento', value: 'transparent' },
  { id: 'selected', label: 'Seleção', value: 'var(--bg-selected)' },
  { id: 'success', label: 'Verde suave', value: 'var(--success-soft)' },
  { id: 'warning', label: 'Atenção suave', value: 'var(--warning-soft)' },
  { id: 'danger', label: 'Vermelho suave', value: 'var(--danger-soft)' },
  { id: 'info', label: 'Azul suave', value: 'var(--info-soft)' },
];

export function normalizeText(value = '') {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function formatDate(value) {
  if (!value) return 'Sem prazo';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 'Sem prazo';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
}

export function isDone(task) {
  return ['done', 'canceled'].includes(String(task?.status || '').toLowerCase());
}

export function isOverdue(task) {
  if (!task?.dueDate || isDone(task)) return false;
  const due = new Date(`${String(task.dueDate).slice(0, 10)}T23:59:59`);
  return !Number.isNaN(due.getTime()) && due < new Date();
}

export function isToday(task) {
  if (!task?.dueDate || isDone(task)) return false;
  return String(task.dueDate).slice(0, 10) === new Date().toISOString().slice(0, 10);
}

export function taskPriorityScore(task) {
  let score = 0;
  if (isOverdue(task)) score += 100;
  if (isToday(task)) score += 50;
  if (task?.priority === 'critical') score += 45;
  if (task?.priority === 'high') score += 25;
  if (!task?.dueDate) score += 4;
  return score;
}

export function taskLabel(task) {
  if (isOverdue(task)) return 'Atrasada';
  if (isToday(task)) return 'Hoje';
  if (task?.priority === 'critical') return 'Crítica';
  if (!task?.dueDate) return 'Sem prazo';
  return 'Próxima';
}

export function columnName(index) {
  let value = Number(index || 0);
  let label = '';
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

export function isCellInRange(rowIndex, colIndex, selection) {
  if (!selection) return false;
  const r1 = Math.min(selection.startRow, selection.endRow);
  const r2 = Math.max(selection.startRow, selection.endRow);
  const c1 = Math.min(selection.startCol, selection.endCol);
  const c2 = Math.max(selection.startCol, selection.endCol);
  return rowIndex >= r1 && rowIndex <= r2 && colIndex >= c1 && colIndex <= c2;
}

export function selectionLabel(selection, columns = []) {
  if (!selection) return 'Nenhuma seleção';
  const r1 = Math.min(selection.startRow, selection.endRow);
  const r2 = Math.max(selection.startRow, selection.endRow);
  const c1 = Math.min(selection.startCol, selection.endCol);
  const c2 = Math.max(selection.startCol, selection.endCol);
  const from = `${columnName(c1)}${r1 + 1}`;
  const to = `${columnName(c2)}${r2 + 1}`;
  const amount = (r2 - r1 + 1) * (c2 - c1 + 1);
  if (amount === 1) return from;
  return `${from}:${to} · ${amount} células`;
}

export function cleanStyle(style = {}) {
  const next = {};
  ['bold', 'italic', 'underline', 'strike'].forEach((key) => {
    if (style[key]) next[key] = true;
  });
  ['align', 'textColor', 'fillColor', 'fontFamily', 'numberFormat'].forEach((key) => {
    if (style[key]) next[key] = style[key];
  });
  return next;
}
