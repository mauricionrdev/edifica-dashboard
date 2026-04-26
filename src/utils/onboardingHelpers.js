// ================================================================
//  Helpers puros para manipulação do estado de onboarding
//  (árvore de sections > tasks > subs).
// ================================================================

/**
 * Normaliza o array de sections vindo da API garantindo os campos
 * esperados pela UI (open, showNote, ids estáveis, subs array).
 */
export function normalizeSections(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((section, si) => ({
    sec: String(section?.sec || ''),
    open: section?.open !== false, // default true
    tasks: (section?.tasks || []).map((task, ti) => ({
      id: String(task?.id || `${section?.sec || 's'}_${ti}`),
      name: String(task?.name || ''),
      done: Boolean(task?.done),
      assignee: String(task?.assignee || ''),
      assigneeId: String(task?.assigneeId || ''),
      dueDate: String(task?.dueDate || ''),
      priority: String(task?.priority || 'medium'),
      status: String(task?.status || (task?.done ? 'done' : 'todo')),
      completedAt: String(task?.completedAt || ''),
      completedBy: String(task?.completedBy || ''),
      notes: String(task?.notes || ''),
      showNote: Boolean(task?.showNote),
      subs: (task?.subs || []).map((sub, j) => ({
        id: String(sub?.id || `${task?.id || 't' + ti}_sub_${j}`),
        name: String(sub?.name || ''),
        done: Boolean(sub?.done),
      })),
    })),
  }));
}

/**
 * { done, total, percent } para o onboarding inteiro.
 * Tarefas e sub-tarefas entram na conta.
 */
export function computeProgress(sections) {
  let total = 0;
  let done = 0;
  for (const sec of sections || []) {
    for (const task of sec.tasks || []) {
      total += 1;
      if (task.done) done += 1;
      for (const sub of task.subs || []) {
        total += 1;
        if (sub.done) done += 1;
      }
    }
  }
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, percent };
}

/**
 * Progresso por seção (considera apenas tasks — subs são detalhe
 * interno, como no protótipo).
 */
export function sectionProgress(section) {
  const tasks = section?.tasks || [];
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  return { done, total };
}

/**
 * Atualização imutável de task por (sectionIndex, taskIndex).
 * Retorna novo array de sections.
 */
export function updateTask(sections, si, ti, patch) {
  return sections.map((sec, i) => {
    if (i !== si) return sec;
    return {
      ...sec,
      tasks: sec.tasks.map((task, j) => {
        if (j !== ti) return task;
        return typeof patch === 'function' ? patch(task) : { ...task, ...patch };
      }),
    };
  });
}

export function updateSection(sections, si, patch) {
  return sections.map((sec, i) => {
    if (i !== si) return sec;
    return typeof patch === 'function' ? patch(sec) : { ...sec, ...patch };
  });
}

export function updateSub(sections, si, ti, subIndex, patch) {
  return updateTask(sections, si, ti, (task) => ({
    ...task,
    subs: task.subs.map((sub, k) => {
      if (k !== subIndex) return sub;
      return typeof patch === 'function' ? patch(sub) : { ...sub, ...patch };
    }),
  }));
}

export function addTask(sections, si, name, assignee = '', assigneeId = '') {
  const section = sections[si];
  if (!section) return sections;
  const nextIndex = section.tasks.length;
  const id = `${section.sec}_custom_${Date.now()}_${nextIndex}`;
  return updateSection(sections, si, (sec) => ({
    ...sec,
    tasks: [
      ...sec.tasks,
      {
        id,
        name: String(name || '').trim(),
        done: false,
        assignee,
        assigneeId,
        dueDate: '',
        priority: 'medium',
        status: 'todo',
        completedAt: '',
        completedBy: '',
        notes: '',
        showNote: false,
        subs: [],
      },
    ],
  }));
}

export function removeTask(sections, si, ti) {
  return updateSection(sections, si, (sec) => ({
    ...sec,
    tasks: sec.tasks.filter((_, j) => j !== ti),
  }));
}

/**
 * Detecta se uma section é a de GDV (última seção, por convenção do
 * protótipo que usava `section index === 7` - "8. GDV").
 */
export function isGDVSection(section, index, total) {
  if (!section) return false;
  const name = String(section.sec || '').toLowerCase();
  // Heurística robusta: nome contém "gdv" OU é a última
  if (name.includes('gdv')) return true;
  return index === total - 1 && total > 1 && name.includes('gdv');
}
