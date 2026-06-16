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
