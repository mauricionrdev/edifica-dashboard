import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { changePassword, updateProfile } from '../api/auth.js';
import {
  createTask,
  createTaskAttachment,
  createTaskComment,
  updateTaskComment,
  deleteTask,
  deleteTaskAttachment,
  deleteTaskComment,
  getTask,
  listTaskEvents,
  listTaskAttachments,
  listTaskCollaborators,
  listTaskSubtasks,
  addTaskCollaborator,
  removeTaskCollaborator,
  listMyProjectTasks,
  listTaskComments,
  updateTask as updateProjectTask,
} from '../api/projects.js';
import { listUserDirectory } from '../api/users.js';
import { listClients } from '../api/clients.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { roleLabel } from '../utils/roles.js';
import { normalizeSlug } from '../utils/slugs.js';
import { hasPermission } from '../utils/permissions.js';
import {
  getClientAvatar,
  getUserAvatar,
  readAvatarFile,
  removeUserAvatar,
  saveUserAvatar,
  subscribeAvatarChange,
} from '../utils/avatarStorage.js';
import DateField from '../components/ui/DateField.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import StateBlock from '../components/ui/StateBlock.jsx';
import { BellIcon, BuildingIcon, CalendarIcon, ChecklistIcon, CloseIcon, SettingsIcon, TargetIcon, TrashIcon, UsersIcon } from '../components/ui/Icons.jsx';
import styles from './ProfilePage.module.css';

const AVATAR_OPTIONS = [
  { value: 'amber', label: 'Âmbar' },
  { value: 'blue', label: 'Azul' },
  { value: 'violet', label: 'Violeta' },
  { value: 'emerald', label: 'Esmeralda' },
  { value: 'rose', label: 'Rose' },
  { value: 'slate', label: 'Escuro' },
];

const SETTINGS_TABS = [
  { value: 'profile', label: 'Perfil' },
  { value: 'account', label: 'Conta' },
];

const DEMAND_TYPES = [
  { value: 'support', label: 'Suporte' },
  { value: 'briefing', label: 'Briefing' },
  { value: 'routine', label: 'Rotina' },
  { value: 'bug', label: 'Bug' },
  { value: 'adjustment', label: 'Ajuste' },
  { value: 'access', label: 'Acesso' },
  { value: 'other', label: 'Outro' },
];

const DEMAND_PRIORITIES = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
];

const BASE_STATUS_OPTIONS = [
  { value: 'todo', label: 'Aberta' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'done', label: 'Concluída' },
  { value: 'canceled', label: 'Cancelada' },
];

const STATUS_OPTIONS_BY_KIND = {
  briefing: [
    { value: 'todo', label: 'Briefing' },
    { value: 'in_progress', label: 'Implementação' },
    { value: 'activation_gdv', label: 'Ativação GDV' },
    { value: 'access_delivery', label: 'Acessos' },
    { value: 'traffic_activation', label: 'Tráfego' },
    { value: 'final_validation', label: 'Validação' },
    { value: 'done', label: 'Concluída' },
    { value: 'canceled', label: 'Cancelado' },
  ],
  routine: [
    { value: 'todo', label: 'Pendente' },
    { value: 'in_progress', label: 'Em execução' },
    { value: 'done', label: 'Feita' },
    { value: 'canceled', label: 'Pulada' },
  ],
  support: [
    { value: 'todo', label: 'Aberto' },
    { value: 'in_progress', label: 'Em análise' },
    { value: 'done', label: 'Resolvido' },
    { value: 'canceled', label: 'Cancelado' },
  ],
  bug: [
    { value: 'todo', label: 'Aberto' },
    { value: 'in_progress', label: 'Em correção' },
    { value: 'done', label: 'Resolvido' },
    { value: 'canceled', label: 'Cancelado' },
  ],
};

function emptyDemandForm(userId = '') {
  return {
    type: 'support',
    title: '',
    description: '',
    assigneeUserId: userId,
    clientId: '',
    dueDate: '',
    priority: 'medium',
    officeName: '',
    objective: '',
    campaign: '',
    channels: '',
    attendants: '',
    greeting: '',
    location: '',
    notes: '',
    recurrence: 'daily',
    routineScope: '',
    routineChecklist: '',
    collaboratorUserIds: [],
    attachments: [],
  };
}

const TASK_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

function isSupportedTaskAttachment(file) {
  const mime = String(file?.type || '');
  return mime.startsWith('image/') || mime === 'application/pdf';
}

function taskAttachmentKind(item) {
  const mime = String(item?.mimeType || '');
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return 'Imagem';
  return 'Arquivo';
}

function readTaskAttachmentFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('Arquivo inválido.'));
      return;
    }
    if (!isSupportedTaskAttachment(file)) {
      reject(new Error('Envie apenas imagens ou PDF.'));
      return;
    }
    if (file.size > TASK_ATTACHMENT_MAX_BYTES) {
      reject(new Error('Arquivo maior que 8 MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      fileName: file.name || (String(file.type || '').startsWith('image/') ? 'imagem.png' : 'arquivo.pdf'),
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size || 0,
      dataUrl: String(reader.result || ''),
    });
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function attachmentSignature(item) {
  return [
    item?.fileName || item?.name || '',
    item?.mimeType || item?.type || '',
    item?.sizeBytes || item?.size || 0,
  ].join('::');
}

function uniqueFiles(files) {
  const seen = new Set();
  return Array.from(files || []).filter((file) => {
    const key = attachmentSignature(file);
    if (!file || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function filesFromClipboard(event) {
  const clipboard = event?.clipboardData;
  const directFiles = Array.from(clipboard?.files || []);
  const itemFiles = Array.from(clipboard?.items || [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter(Boolean);

  return uniqueFiles([...directFiles, ...itemFiles]);
}

const COMMENT_ATTACHMENT_MARKER = '[[task-attachments:';

function commentAttachmentIds(comment) {
  const body = String(comment?.body || comment?.content || '');
  const match = body.match(/\[\[task-attachments:([^\]]+)\]\]/);
  if (!match) return [];
  return match[1].split(',').map((id) => id.trim()).filter(Boolean);
}

function commentDisplayBody(comment) {
  return String(comment?.body || comment?.content || '').replace(/\n?\[\[task-attachments:[^\]]+\]\]/g, '').trim();
}

function commentAttachmentItems(comment, attachments = []) {
  const ids = new Set(commentAttachmentIds(comment));
  if (!ids.size) return [];
  return attachments.filter((item) => ids.has(String(item.id)));
}


function emptyHandoffForm(userId = '', status = 'in_progress') {
  return {
    assigneeUserId: userId,
    status,
    nextAction: '',
    pending: '',
    note: '',
  };
}

function demandTypeLabel(type) {
  return DEMAND_TYPES.find((item) => item.value === type)?.label || 'Demanda';
}

function buildDemandDescription(form, clientName = '') {
  const type = demandTypeLabel(form.type);
  const lines = [`Tipo: ${type}`];

  if (clientName) lines.push(`Cliente: ${clientName}`);

  if (form.type === 'briefing') {
    const briefingLines = [
      ['Nome do escritório', form.officeName],
      ['Objetivo', form.objective],
      ['Nicho/campanha', form.campaign],
      ['Canais', form.channels],
      ['Atendentes', form.attendants],
      ['Saudação', form.greeting],
      ['Localização', form.location],
      ['Observações', form.notes],
    ]
      .filter(([, value]) => String(value || '').trim())
      .map(([label, value]) => `${label}: ${String(value).trim()}`);

    if (briefingLines.length) {
      lines.push('', 'Briefing', ...briefingLines);
    }
  }

  if (form.type === 'routine') {
    const routineLines = [
      ['Recorrência', recurrenceLabel(form.recurrence)],
      ['Escopo', form.routineScope],
      ['Checklist', form.routineChecklist],
    ]
      .filter(([, value]) => String(value || '').trim())
      .map(([label, value]) => `${label}: ${String(value).trim()}`);

    if (routineLines.length) {
      lines.push('', 'Rotina', ...routineLines);
    }
  }

  const freeDescription = String(form.description || '').trim();
  if (freeDescription) lines.push('', freeDescription);

  return lines.join('\n');
}

function joinMissingFields(items = []) {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list.join('');
  if (list.length === 2) return `${list[0]} e ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

function validateDemandForm(form = {}) {
  const missing = [];
  const requiredText = (key, label) => {
    if (!String(form[key] || '').trim()) missing.push(label);
  };

  requiredText('title', 'Título');
  if (!String(form.assigneeUserId || '').trim()) missing.push('Responsável');

  if (form.type === 'briefing') {
    if (!String(form.clientId || '').trim()) missing.push('Cliente');
    [
      ['officeName', 'Escritório'],
      ['objective', 'Objetivo'],
      ['campaign', 'Nicho/campanha'],
      ['channels', 'Canais'],
      ['attendants', 'Atendentes'],
      ['greeting', 'Saudação'],
      ['location', 'Localização'],
    ].forEach(([key, label]) => requiredText(key, label));
  }

  if (form.type === 'routine') {
    requiredText('routineScope', 'Escopo');
    requiredText('routineChecklist', 'Checklist');
  }

  return missing;
}

function emptyOperationLabel(tab) {
  const labels = {
    today: 'Nada para hoje',
    overdue: 'Sem atrasadas',
    critical: 'Sem críticas',
    briefing: 'Sem briefings',
    routine: 'Sem rotinas',
    support: 'Sem suporte',
    watching: 'Sem acompanhamentos',
    waiting: 'Sem demandas',
    done: 'Sem concluídas',
    all: 'Sem tarefas',
  };
  return labels[tab] || 'Sem demandas';
}

const ROUTINE_RECURRENCES = [
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
];

function recurrenceLabel(value) {
  return ROUTINE_RECURRENCES.find((item) => item.value === value)?.label || value || '';
}


const BRIEFING_FIELDS = [
  { key: 'officeName', label: 'Escritório', source: 'Nome do escritório', required: true },
  { key: 'objective', label: 'Objetivo', source: 'Objetivo', required: true },
  { key: 'campaign', label: 'Nicho/campanha', source: 'Nicho/campanha', required: true },
  { key: 'channels', label: 'Canais', source: 'Canais', required: true },
  { key: 'attendants', label: 'Atendentes', source: 'Atendentes', required: true },
  { key: 'greeting', label: 'Saudação', source: 'Saudação', required: true },
  { key: 'location', label: 'Localização', source: 'Localização', required: true },
  { key: 'notes', label: 'Observações', source: 'Observações', required: false },
];

function parseBriefingDescription(description = '') {
  const rawLines = String(description || '').split(/\r?\n/);
  const values = {};
  const consumed = new Set();

  rawLines.forEach((line, index) => {
    const trimmed = line.trim();
    BRIEFING_FIELDS.forEach((field) => {
      const prefix = `${field.source}:`;
      if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
        values[field.key] = trimmed.slice(prefix.length).trim();
        consumed.add(index);
      }
    });

    if (/^(tipo|cliente):/i.test(trimmed) || /^briefing$/i.test(trimmed) || !trimmed) {
      consumed.add(index);
    }
  });

  const required = BRIEFING_FIELDS.filter((field) => field.required);
  const filledRequired = required.filter((field) => String(values[field.key] || '').trim()).length;
  const extraDescription = rawLines
    .filter((line, index) => !consumed.has(index) && line.trim())
    .join('\n')
    .trim();

  const missingRequired = required.filter((field) => !String(values[field.key] || '').trim());

  return {
    values,
    extraDescription,
    completion: required.length ? Math.round((filledRequired / required.length) * 100) : 100,
    isComplete: filledRequired === required.length,
    filledRequired,
    requiredTotal: required.length,
    missingRequired,
  };
}

const ROUTINE_FIELDS = [
  { key: 'recurrence', label: 'Recorrência', source: 'Recorrência' },
  { key: 'scope', label: 'Escopo', source: 'Escopo' },
  { key: 'checklist', label: 'Checklist', source: 'Checklist' },
];

function parseStructuredBlock(description = '', title = '', fields = []) {
  const rawLines = String(description || '').split(/\r?\n/);
  const values = {};
  const consumed = new Set();

  rawLines.forEach((line, index) => {
    const trimmed = line.trim();
    fields.forEach((field) => {
      const prefix = `${field.source}:`;
      if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
        values[field.key] = trimmed.slice(prefix.length).trim();
        consumed.add(index);
      }
    });

    if (/^(tipo|cliente):/i.test(trimmed) || trimmed.toLowerCase() === title.toLowerCase() || !trimmed) {
      consumed.add(index);
    }
  });

  const extraDescription = rawLines
    .filter((line, index) => !consumed.has(index) && line.trim())
    .join('\n')
    .trim();

  return { values, extraDescription };
}

function parseRoutineDescription(description = '') {
  return parseStructuredBlock(description, 'Rotina', ROUTINE_FIELDS);
}

function clientSearchText(client) {
  return normalizeText([client?.name, client?.companyName, client?.squadName, client?.managerName, client?.gdvName].filter(Boolean).join(' '));
}


const OPERATION_TABS = [
  { value: 'all', label: 'Todas' },
  { value: 'today', label: 'Hoje' },
  { value: 'overdue', label: 'Atrasadas' },
  { value: 'critical', label: 'Críticas' },
  { value: 'done', label: 'Concluídas' },
];

const OPERATION_PAGE_SIZE = 8;



const PRIORITY_WEIGHT = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function priorityKey(task) {
  return task?.priority || 'medium';
}

function isCriticalTask(task) {
  return !isDone(task) && priorityKey(task) === 'critical';
}

function isCollaboratorTask(task) {
  return !isDone(task) && task?.profileRelation === 'collaborator';
}

function relationLabel(task) {
  if (task?.profileRelation === 'collaborator') return 'Acompanhando';
  return 'Responsável';
}

function taskCreatedTime(task) {
  const raw = task?.createdAt || task?.created_at || task?.createdDate || task?.created_date || null;
  if (!raw) return 0;
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareOperationTasks(a, b) {
  const createdDiff = taskCreatedTime(b) - taskCreatedTime(a);
  if (createdDiff !== 0) return createdDiff;

  const aId = Number(a?.id);
  const bId = Number(b?.id);
  if (!Number.isNaN(aId) && !Number.isNaN(bId) && aId !== bId) return bId - aId;

  return String(a?.title || '').localeCompare(String(b?.title || ''), 'pt-BR');
}

function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}


function avatarColorKey(value) {
  return String(value || 'amber').toLowerCase();
}

function commentAvatarUrl(comment, directory = [], currentUser = null) {
  if (comment?.avatarUrl) return comment.avatarUrl;
  if (comment?.userId && currentUser?.id === comment.userId) return getUserAvatar(currentUser);
  const entry = (Array.isArray(directory) ? directory : []).find((item) => item?.id === comment?.userId);
  return getUserAvatar(entry);
}

function commentAvatarColor(comment, directory = [], currentUser = null) {
  if (comment?.avatarColor) return avatarColorKey(comment.avatarColor);
  if (comment?.userId && currentUser?.id === comment.userId) return avatarColorKey(currentUser?.avatarColor);
  const entry = (Array.isArray(directory) ? directory : []).find((item) => item?.id === comment?.userId);
  return avatarColorKey(entry?.avatarColor);
}

function dateKey(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function getTodayKey() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
}

function formatDueLabel(value) {
  const key = dateKey(value);
  if (!key) return 'Sem prazo';

  const diff = Math.round((key - getTodayKey()) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${value}T00:00:00`));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isDone(task) {
  return task?.done || task?.status === 'done';
}

function isOverdue(task) {
  if (isDone(task) || !task?.dueDate) return false;
  const key = dateKey(task.dueDate);
  return key ? key < getTodayKey() : false;
}

function isToday(task) {
  if (isDone(task) || !task?.dueDate) return false;
  const key = dateKey(task.dueDate);
  return key ? key === getTodayKey() : false;
}

function getTaskKind(task) {
  const haystack = normalizeText([
    task?.title,
    task?.description,
    task?.projectName,
    task?.sectionName,
    task?.metadata?.type,
    task?.metadata?.origin,
  ].filter(Boolean).join(' '));

  if (/briefing|implementacao|implementado|implementar|setup|onboarding/.test(haystack)) return 'briefing';
  if (/pente fino|diario|diaria|rotina|recorrente|auditoria/.test(haystack)) return 'routine';
  if (/bug|erro|falha|quebrado|crash|travou/.test(haystack)) return 'bug';
  if (/ajuste|corrigir|alteracao|melhoria|refinar|mudanca/.test(haystack)) return 'adjustment';
  if (/acesso|permissao|login|senha|conexao|desconectado|qr code|qrcode/.test(haystack)) return 'access';
  if (/suporte|problema|solicitacao|chamado|duvida/.test(haystack)) return 'support';
  if (task?.projectId || task?.projectName) return 'project';
  return 'other';
}

function kindLabel(kind) {
  const labels = {
    briefing: 'Briefing',
    routine: 'Rotina',
    support: 'Suporte',
    bug: 'Bug',
    adjustment: 'Ajuste',
    access: 'Acesso',
    other: 'Outro',
    project: 'Projeto',
    demand: 'Outro',
  };
  return labels[kind] || 'Outro';
}

function statusOptionsForKind(kind) {
  return STATUS_OPTIONS_BY_KIND[kind] || BASE_STATUS_OPTIONS;
}

function statusLabel(task) {
  const kind = getTaskKind(task);
  if (isOverdue(task) && !isDone(task) && task?.status !== 'canceled') return 'Atrasada';
  const value = task?.status || (isDone(task) ? 'done' : 'todo');
  const label = statusOptionsForKind(kind).find((option) => option.value === value)?.label;
  if (label) return label;
  if (isToday(task)) return 'Hoje';
  return 'Aguardando';
}

function statusKey(task) {
  if (task?.status === 'canceled') return 'canceled';
  if (isDone(task)) return 'done';
  if (isOverdue(task)) return 'overdue';
  if (['in_progress', 'activation_gdv', 'access_delivery', 'traffic_activation', 'final_validation'].includes(task?.status)) return 'active';
  if (isToday(task)) return 'today';
  return 'waiting';
}

function priorityLabel(value) {
  const labels = { low: 'Baixa', medium: 'Normal', high: 'Alta', critical: 'Crítica' };
  return labels[value] || labels.medium;
}

function displayTaskTitle(task) {
  return String(task?.title || '')
    .replace(/^\s*(?:[→↗➜»]+|[-–—]>?)\s*/u, '')
    .trim() || 'Sem título';
}

function extractTaskClientName(task = {}) {
  const direct = task.clientName || task.client_name || task.metadata?.clientName || task.metadata?.client_name || task.handoff?.clientName;
  if (direct) return String(direct).trim();

  const match = String(task.description || '').match(/^Cliente:\s*(.+)$/im);
  return match?.[1]?.trim() || '';
}

function isProjectOriginTask(task = {}) {
  const origin = String(task.source || task.origin || task.metadata?.origin || '').toLowerCase();
  return Boolean(task.projectId || task.project_id || task.projectName || task.project_name || origin.includes('project') || origin.includes('projeto'));
}

function taskProjectName(task = {}) {
  return String(task.projectName || task.project_name || task.metadata?.projectName || '').trim();
}

function nextActionLabel(task) {
  if (!task) return '';
  if (task.status === 'canceled') return 'Encerrada';
  const kind = getTaskKind(task);
  if (kind === 'briefing') {
    const stage = task.status || 'todo';
    if (stage === 'done') return 'Operação concluída';
    if (stage === 'activation_gdv') return 'GDV ativa WhatsApp na DKW';
    if (stage === 'access_delivery') return 'Enviar login e senha ao cliente';
    if (stage === 'traffic_activation') return 'CAP ativa tráfego pago';
    if (stage === 'final_validation') return 'Validar operação e encerrar';
    if (isDone(task)) return 'Operação concluída';
    if (isOverdue(task)) return 'Regularizar prazo';
    return stage === 'in_progress' ? 'Implementar cliente na DKW' : 'Validar briefing';
  }
  if (kind === 'support' && isDone(task)) return 'Resolvido';
  if (kind === 'routine' && isDone(task)) return 'Rotina feita';
  if (isDone(task)) return 'Concluída';
  if (isOverdue(task)) return 'Regularizar prazo';
  if (kind === 'routine') return 'Executar rotina';
  if (kind === 'support') return 'Analisar solicitação';
  if (kind === 'project') return 'Executar tarefa do projeto';
  return 'Executar demanda';
}

function taskAssigneeName(task, users = []) {
  if (!task) return 'Sem responsável';
  const assigneeId = task.assigneeUserId || task.assignee_user_id;
  return task.assigneeName || users.find((item) => item.id === assigneeId)?.name || 'Sem responsável';
}

function taskRequesterName(task, fallback = 'Solicitante') {
  if (!task) return fallback;
  return task.createdByName || task.requesterName || task.authorName || fallback;
}

function visibleOperationTags(task) {
  const kind = getTaskKind(task);
  const tags = [
    { key: 'kind', label: kindLabel(kind), className: 'kindPill', tone: `kind_${kind}` },
    { key: 'priority', label: priorityLabel(priorityKey(task)), className: 'priorityPill', tone: `priority_${priorityKey(task)}` },
    { key: 'status', label: statusLabel(task), className: 'statusPill', tone: `status_${statusKey(task)}` },
    { key: 'relation', label: relationLabel(task), className: 'relationPill', tone: task?.profileRelation === 'collaborator' ? 'relation_watching' : 'relation_responsible' },
  ];

  return tags.filter((tag, index, list) => list.findIndex((item) => item.label === tag.label) === index).slice(0, 4);
}


function taskStageProgress(task) {
  const kind = getTaskKind(task);
  const status = task?.status || (isDone(task) ? 'done' : 'todo');

  if (task?.status === 'canceled') {
    return { label: 'Cancelada', progress: 100, tone: 'red' };
  }

  if (kind === 'briefing') {
    const order = ['todo', 'in_progress', 'activation_gdv', 'access_delivery', 'traffic_activation', 'final_validation', 'done'];
    const currentIndex = Math.max(0, order.indexOf(isDone(task) ? 'done' : status));
    const progress = Math.round(((currentIndex + 1) / order.length) * 100);
    return { label: statusLabel(task), progress, tone: isDone(task) ? 'green' : currentIndex >= 4 ? 'teal' : currentIndex >= 2 ? 'amber' : 'yellow' };
  }

  if (isDone(task)) return { label: statusLabel(task), progress: 100, tone: 'green' };
  if (status === 'in_progress') return { label: statusLabel(task), progress: 62, tone: 'amber' };
  if (isOverdue(task)) return { label: statusLabel(task), progress: 42, tone: 'red' };
  if (isToday(task)) return { label: statusLabel(task), progress: 48, tone: 'yellow' };
  return { label: statusLabel(task), progress: 28, tone: 'yellow' };
}

function userFromDirectory(userId, users = []) {
  const id = String(userId || '').trim();
  if (!id) return null;
  return users.find((item) => String(item?.id || '') === id) || null;
}

function buildTaskPeople(task, users = []) {
  const people = [];
  const seen = new Set();

  function addPerson(person = {}) {
    const userId = String(person.userId || person.user_id || person.id || '').trim();
    const directoryUser = userFromDirectory(userId, users);
    const name = person.userName || person.user_name || person.name || directoryUser?.name || '';
    const email = person.userEmail || person.user_email || person.email || directoryUser?.email || '';
    const avatarUrl = person.avatarUrl || directoryUser?.avatarUrl || '';
    const avatarColor = person.avatarColor || person.avatar_color || directoryUser?.avatarColor || directoryUser?.avatar_color || 'amber';
    const key = userId || `${name}-${email}`;

    if (!key || seen.has(key)) return;
    seen.add(key);
    people.push({
      userId,
      userName: name || 'Usuário',
      userEmail: email,
      avatarUrl,
      avatarColor,
    });
  }

  if (Array.isArray(task?.collaborators)) task.collaborators.forEach(addPerson);
  if (Array.isArray(task?.people)) task.people.forEach(addPerson);

  addPerson({
    userId: task?.createdByUserId || task?.created_by_user_id,
    userName: task?.createdByName || task?.created_by_name,
  });
  addPerson({
    userId: task?.assigneeUserId || task?.assignee_user_id,
    userName: task?.assigneeName || task?.assignee_name,
  });

  return people.filter((person) => person.userName || person.userId).slice(0, 8);
}

function taskPeopleLabel(people = []) {
  if (!people.length) return 'Sem colaboradores';
  const names = people.map((person) => person.userName || 'Usuário');
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} e mais ${names.length - 3}`;
}



function avatarColorClassName(color) {
  const value = String(color || 'amber').toLowerCase();
  const allowed = ['amber', 'blue', 'violet', 'emerald', 'rose', 'slate'];
  return allowed.includes(value) ? value : 'amber';
}

function briefingStageAction(task, briefing) {
  if (!task || getTaskKind(task) !== 'briefing' || task.status === 'canceled') return null;
  const status = task.status || 'todo';

  if (status === 'done') return null;
  if (briefing && !briefing.isComplete) return { type: 'issues', label: 'Pendências' };
  if (status === 'final_validation') return { type: 'complete', label: 'Concluir tarefa' };

  const nextByStatus = {
    todo: { status: 'in_progress', label: 'Iniciar implementação', nextAction: 'Implementar cliente na DKW' },
    in_progress: { status: 'activation_gdv', label: 'Enviar para ativação', nextAction: 'GDV faz reunião de ativação e conecta QR Code na DKW' },
    activation_gdv: { status: 'access_delivery', label: 'Enviar acessos', nextAction: 'Suporte envia login e senha da DKW ao cliente' },
    access_delivery: { status: 'traffic_activation', label: 'Enviar para tráfego', nextAction: 'CAP ativa tráfego pago para iniciar recebimento de leads' },
    traffic_activation: { status: 'final_validation', label: 'Validar operação', nextAction: 'Suporte valida operação completa antes de concluir' },
  };

  return { type: 'handoff', ...(nextByStatus[status] || nextByStatus.in_progress) };
}

function demandCollaboratorOptions(users = [], form = {}) {
  const blocked = new Set([form.assigneeUserId, ...(form.collaboratorUserIds || [])].filter(Boolean));
  return users
    .filter((item) => item?.id && !blocked.has(item.id))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
}

function workflowStepsForTask(task) {
  const kind = getTaskKind(task);
  const status = task?.status || 'todo';
  const done = isDone(task);

  if (kind === 'briefing') {
    const order = ['todo', 'in_progress', 'activation_gdv', 'access_delivery', 'traffic_activation', 'final_validation', 'done'];
    const currentIndex = Math.max(0, order.indexOf(status));
    const labels = {
      todo: 'Briefing',
      in_progress: 'Implementação',
      activation_gdv: 'Ativação GDV',
      access_delivery: 'Acessos',
      traffic_activation: 'Tráfego',
      final_validation: 'Validação',
      done: 'Concluída',
    };

    return order.map((key, index) => ({
      key,
      label: labels[key],
      state: done && key === 'done' ? 'current' : index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending',
    }));
  }

  if (kind === 'routine') {
    return [
      { key: 'pending', label: 'Pendente', state: done || status !== 'todo' ? 'done' : 'current' },
      { key: 'execution', label: 'Execução', state: done ? 'done' : status === 'in_progress' ? 'current' : 'pending' },
      { key: 'done', label: 'Feita', state: done ? 'current' : 'pending' },
    ];
  }

  if (kind === 'support') {
    return [
      { key: 'open', label: 'Aberto', state: done || status !== 'todo' ? 'done' : 'current' },
      { key: 'analysis', label: 'Análise', state: done ? 'done' : status === 'in_progress' ? 'current' : 'pending' },
      { key: 'resolved', label: 'Resolvido', state: done ? 'current' : 'pending' },
    ];
  }

  return [
    { key: 'open', label: 'Aberta', state: done || status !== 'todo' ? 'done' : 'current' },
    { key: 'progress', label: 'Execução', state: done ? 'done' : status === 'in_progress' ? 'current' : 'pending' },
    { key: 'done', label: 'Concluída', state: done ? 'current' : 'pending' },
  ];
}

function getOperationCounts(tasks) {
  const openTasks = tasks.filter((task) => !isDone(task));
  return {
    all: tasks.length,
    open: openTasks.length,
    risk: tasks.filter((task) => isOverdue(task) || isCriticalTask(task)).length,
    today: tasks.filter(isToday).length,
    overdue: tasks.filter(isOverdue).length,
    critical: tasks.filter(isCriticalTask).length,
    briefing: tasks.filter((task) => !isDone(task) && getTaskKind(task) === 'briefing').length,
    routine: tasks.filter((task) => !isDone(task) && getTaskKind(task) === 'routine').length,
    support: tasks.filter((task) => !isDone(task) && getTaskKind(task) === 'support').length,
    watching: tasks.filter(isCollaboratorTask).length,
    waiting: tasks.filter((task) => !isDone(task) && !isToday(task) && !isOverdue(task) && task?.profileRelation !== 'collaborator').length,
    done: tasks.filter(isDone).length,
  };
}

function getVisibleTasks(tasks, tab) {
  const filtered = tasks.filter((task) => {
    if (tab === 'all') return true;
    if (tab === 'done') return isDone(task);
    if (tab === 'overdue') return isOverdue(task);
    if (tab === 'today') return isToday(task);
    if (tab === 'critical') return isCriticalTask(task);
    if (tab === 'briefing') return !isDone(task) && getTaskKind(task) === 'briefing';
    if (tab === 'routine') return !isDone(task) && getTaskKind(task) === 'routine';
    if (tab === 'support') return !isDone(task) && getTaskKind(task) === 'support';
    if (tab === 'watching') return isCollaboratorTask(task);
    return !isDone(task) && !isToday(task) && !isOverdue(task) && task?.profileRelation !== 'collaborator';
  });

  return filtered.sort(compareOperationTasks);
}

function taskSearchText(task) {
  return normalizeText([
    task?.title,
    task?.description,
    task?.clientName,
    task?.projectName,
    task?.sectionName,
    task?.assigneeName,
    task?.createdByName,
    kindLabel(getTaskKind(task)),
    priorityLabel(priorityKey(task)),
    relationLabel(task),
    statusLabel(task),
    formatDueLabel(task?.dueDate),
  ].filter(Boolean).join(' '));
}

function filterOperationTasks(tasks, query) {
  const term = normalizeText(query).trim();
  if (!term) return tasks;
  return tasks.filter((task) => taskSearchText(task).includes(term));
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}


function formatProfileDate(value) {
  const date = value instanceof Date ? value : new Date();
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function greetingForDate(value) {
  const hour = (value instanceof Date ? value : new Date()).getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function summarizeOpenSubtasks(subtasks = []) {
  const openItems = subtasks.filter((item) => !isDone(item));
  if (!openItems.length) return 'Sem pendências abertas';
  return openItems.slice(0, 6).map((item) => `- ${item.title || 'Subtarefa'}`).join('\n');
}

function summarizeRecentComments(comments = []) {
  const items = comments
    .filter((comment) => !isSystemActivityComment(comment))
    .slice(-3)
    .map((comment) => {
      const author = comment?.authorName || comment?.userName || 'Usuário';
      const body = commentBody(comment).replace(/\s+/g, ' ').trim();
      return body ? `- ${author}: ${body.slice(0, 180)}` : '';
    })
    .filter(Boolean);

  return items.length ? items.join('\n') : 'Sem comentários recentes';
}

function buildHandoffBody({ task, assigneeName, statusLabelText, nextAction, pending, note, subtasks, comments }) {
  const lines = [
    `Handoff: ${assigneeName || 'Responsável'}`,
    `Status: ${statusLabelText}`,
    `Tipo: ${kindLabel(getTaskKind(task))}`,
    `Prioridade: ${priorityLabel(priorityKey(task))}`,
    `Prazo: ${formatDueLabel(task?.dueDate)}`,
  ];

  if (task?.clientName) lines.push(`Cliente: ${task.clientName}`);
  if (task?.projectName) lines.push(`Projeto: ${task.projectName}`);
  if (task?.sectionName) lines.push(`Seção: ${task.sectionName}`);

  const cleanNextAction = String(nextAction || '').trim();
  const cleanPending = String(pending || '').trim();
  const cleanNote = String(note || '').trim();

  if (cleanNextAction) lines.push('', 'Próxima ação', cleanNextAction);
  lines.push('', 'Pendências', cleanPending || summarizeOpenSubtasks(subtasks));
  if (cleanNote) lines.push('', 'Contexto', cleanNote);
  lines.push('', 'Comentários recentes', summarizeRecentComments(comments));

  return lines.join('\n').trim();
}

function commentBody(comment) {
  return String(comment?.body || comment?.content || '').trim();
}

function isSystemCommentBody(body = '') {
  return /^(Handoff:|Status:|Demanda concluída\.|Implementação concluída\.|Briefing incompleto\.)/i.test(String(body || '').trim());
}

function isSystemActivityComment(comment) {
  return isSystemCommentBody(commentBody(comment));
}

function compactInlineText(value = '') {
  return String(value || '')
    .replace(/^[-•]\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function readLabeledLine(lines = [], label = '') {
  const pattern = new RegExp(`^${label}:\\s*`, 'i');
  const line = lines.find((item) => pattern.test(item));
  return line ? line.replace(pattern, '').trim() : '';
}

function readHandoffSection(lines = [], label = '') {
  const index = lines.findIndex((item) => item.toLowerCase() === label.toLowerCase());
  if (index < 0) return '';

  const values = [];
  for (let position = index + 1; position < lines.length; position += 1) {
    const current = lines[position];
    if (/^(Próxima ação|Pendências|Contexto|Comentários recentes)$/i.test(current)) break;
    values.push(current);
  }

  return compactInlineText(values.join(' '));
}

function buildHandoffActivityNote(lines = []) {
  const type = readLabeledLine(lines, 'Tipo');
  const priority = readLabeledLine(lines, 'Prioridade');
  const deadline = readLabeledLine(lines, 'Prazo');
  const client = readLabeledLine(lines, 'Cliente');
  const project = readLabeledLine(lines, 'Projeto');
  const nextAction = readHandoffSection(lines, 'Próxima ação');
  const pending = readHandoffSection(lines, 'Pendências');
  const context = readHandoffSection(lines, 'Contexto');
  const recentComments = readHandoffSection(lines, 'Comentários recentes');

  const summary = [
    client ? `Cliente: ${client}` : '',
    project ? `Projeto: ${project}` : '',
    [type ? `Tipo: ${type}` : '', priority ? `Prioridade: ${priority}` : '', deadline ? `Prazo: ${deadline}` : ''].filter(Boolean).join(' · '),
  ].filter(Boolean);

  const sections = [
    ...summary,
    nextAction ? `Próxima ação: ${nextAction}` : '',
    pending ? `Pendências: ${pending}` : '',
    context ? `Contexto: ${context}` : '',
    recentComments ? `Comentários recentes: ${recentComments}` : '',
  ].filter(Boolean);

  return sections.join('\n');
}

function parseSystemActivityComment(comment) {
  const body = commentBody(comment);
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const author = comment?.authorName || comment?.userName || 'Sistema';
  const createdAt = comment?.createdAt || comment?.updatedAt;

  if (/^Handoff:/i.test(lines[0] || '')) {
    const target = readLabeledLine(lines, 'Handoff');
    const status = readLabeledLine(lines, 'Status');
    const note = buildHandoffActivityNote(lines);
    return {
      id: `handoff-${comment.id}`,
      type: 'handoff',
      title: target ? `Handoff para ${target}` : 'Handoff registrado',
      meta: status || 'Responsável atualizado',
      note,
      author,
      createdAt,
    };
  }

  if (/^(Demanda concluída\.|Implementação concluída\.)/i.test(lines[0] || '')) {
    const note = lines.slice(1).join('\n');
    return {
      id: `done-${comment.id}`,
      type: 'done',
      title: lines[0].replace(/\.$/, ''),
      meta: author,
      note,
      author,
      createdAt,
    };
  }

  if (/^Briefing incompleto\./i.test(lines[0] || '')) {
    const note = lines.slice(1).join('\n');
    return {
      id: `briefing-issues-${comment.id}`,
      type: 'briefing',
      title: 'Briefing incompleto',
      meta: author,
      note,
      author,
      createdAt,
    };
  }

  return null;
}

function formatEventTypeLabel(type) {
  const labels = {
    'task.created': 'Demanda criada',
    'task.updated': 'Demanda atualizada',
    'task.status_changed': 'Status alterado',
    'task.priority_changed': 'Prioridade alterada',
    'task.assignee_changed': 'Responsável alterado',
    'task.due_date_changed': 'Prazo alterado',
    'task.comment_added': 'Comentário na demanda',
    'task.commented': 'Comentário na demanda',
    'task.comment_deleted': 'Comentário removido',
    'task.handoff_registered': 'Handoff registrado',
    'task.collaborator_added': 'Colaborador adicionado',
    'task.collaborator_removed': 'Colaborador removido',
    'task.subtask_created': 'Subtarefa criada',
    'task.completed': 'Demanda concluída',
    'task.reopened': 'Demanda reaberta',
  };
  return labels[type] || 'Atividade registrada';
}

function eventTypeKey(type = '') {
  if (String(type).includes('handoff')) return 'handoff';
  if (String(type).includes('collaborator')) return 'collaborator';
  if (String(type).includes('comment')) return 'comment';
  if (String(type).includes('subtask')) return 'subtask';
  if (String(type).includes('complete') || String(type).includes('done')) return 'done';
  if (String(type).includes('status') || String(type).includes('priority') || String(type).includes('assignee') || String(type).includes('due')) return 'updated';
  return 'created';
}

function looksLikeTechnicalId(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) return true;
  if (/^[0-9a-f]{24,}$/i.test(text)) return true;
  if (/^sk-[a-z0-9_-]{16,}$/i.test(text)) return true;
  return false;
}

function formatEventMetadataValue(key, value) {
  if (value === null || value === undefined || value === '') return '';
  if (/id$/i.test(key) || /_id$/i.test(key) || looksLikeTechnicalId(value)) return '';

  if (Array.isArray(value)) {
    const visibleItems = value.map((item) => formatEventMetadataValue(key, item)).filter(Boolean);
    if (!visibleItems.length) return '';
    if (/task/i.test(key)) return visibleItems.length === 1 ? '1 tarefa' : `${visibleItems.length} tarefas`;
    if (/section/i.test(key)) return visibleItems.length === 1 ? '1 seção' : `${visibleItems.length} seções`;
    if (/user|collaborator/i.test(key)) return visibleItems.length === 1 ? '1 usuário' : `${visibleItems.length} usuários`;
    return visibleItems.join(', ');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([childKey]) => !/id$/i.test(childKey) && !/_id$/i.test(childKey))
      .map(([childKey, childValue]) => formatEventMetadataValue(childKey, childValue))
      .filter(Boolean);
    return entries.join(' · ');
  }

  if (/status/i.test(key)) return statusLabel({ status: value });
  if (/priority|prioridade/i.test(key)) return priorityLabel(value);
  if (/role|perfil/i.test(key)) return value === 'creator' ? 'Criador' : value === 'follower' ? 'Acompanhando' : String(value);
  if (/due|date|prazo/i.test(key)) return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? formatDueLabel(value) : String(value);
  return String(value);
}

function formatEventMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return '';
  const hidden = new Set(['taskId', 'projectId', 'clientId', 'sectionId', 'userId', 'id']);
  return Object.entries(metadata)
    .filter(([key]) => !hidden.has(key) && !/id$/i.test(key) && !/_id$/i.test(key))
    .map(([key, value]) => formatEventMetadataValue(key, value))
    .filter(Boolean)
    .join(' · ');
}

function eventCommentPreview(metadata = {}) {
  if (!metadata || typeof metadata !== 'object') return '';
  return compactInlineText(metadata.comentario || metadata.comment || metadata.body || metadata.content || '');
}

function buildStructuredHandoffNote(metadata = {}) {
  if (!metadata || typeof metadata !== 'object') return '';
  const summary = [
    metadata.cliente ? `Cliente: ${metadata.cliente}` : '',
    metadata.projeto ? `Projeto: ${metadata.projeto}` : '',
    [
      metadata.tipo ? `Tipo: ${metadata.tipo}` : '',
      metadata.prioridade ? `Prioridade: ${metadata.prioridade}` : '',
      metadata.prazo ? `Prazo: ${metadata.prazo}` : '',
    ].filter(Boolean).join(' · '),
  ].filter(Boolean);

  return [
    ...summary,
    metadata.proximaAcao ? `Próxima ação: ${metadata.proximaAcao}` : '',
    metadata.pendencias ? `Pendências: ${metadata.pendencias}` : '',
    metadata.contexto ? `Contexto: ${metadata.contexto}` : '',
    metadata.comentariosRecentes ? `Comentários recentes: ${metadata.comentariosRecentes}` : '',
  ].filter(Boolean).join('\n');
}

function parseTaskEvent(event) {
  if (!event?.id) return null;

  if (/^task\.handoff_registered$/i.test(String(event.type || ''))) {
    const metadata = event.metadata || {};
    return {
      id: `event-${event.id}`,
      type: 'handoff',
      title: event.summary || (metadata.destino ? `Handoff para ${metadata.destino}` : 'Handoff registrado'),
      meta: metadata.status || event.actorName || 'Sistema',
      note: buildStructuredHandoffNote(metadata),
      author: event.actorName || 'Sistema',
      createdAt: event.createdAt,
    };
  }

  if (/^task\.(comment_added|commented)$/i.test(String(event.type || ''))) {
    const preview = eventCommentPreview(event.metadata);
    if (isSystemCommentBody(preview)) return null;
    return {
      id: `event-${event.id}`,
      type: 'comment',
      title: 'Comentário na demanda',
      meta: event.actorName || 'Sistema',
      note: preview ? `Comentário: ${preview}` : '',
      author: event.actorName || 'Sistema',
      createdAt: event.createdAt,
    };
  }

  if (/^task\.comment_deleted$/i.test(String(event.type || ''))) {
    const preview = eventCommentPreview(event.metadata);
    return {
      id: `event-${event.id}`,
      type: 'comment',
      title: 'Comentário removido',
      meta: event.actorName || 'Sistema',
      note: preview ? `Comentário: ${preview}` : '',
      author: event.actorName || 'Sistema',
      createdAt: event.createdAt,
    };
  }

  const note = formatEventMetadata(event.metadata);
  return {
    id: `event-${event.id}`,
    type: eventTypeKey(event.type),
    title: event.summary || formatEventTypeLabel(event.type),
    meta: event.actorName || 'Sistema',
    note,
    author: event.actorName || 'Sistema',
    createdAt: event.createdAt,
  };
}

function buildActivityEvents(task, comments = [], taskEvents = []) {
  if (!task) return [];

  const events = [];
  const seen = new Set();
  const pushEvent = (event) => {
    if (!event?.id || seen.has(event.id)) return;
    seen.add(event.id);
    events.push(event);
  };

  taskEvents.map(parseTaskEvent).filter(Boolean).forEach(pushEvent);

  if (task.createdByName) {
    pushEvent({
      id: 'created',
      type: 'created',
      title: 'Demanda criada',
      meta: task.createdByName,
      createdAt: task.createdAt,
    });
  }

  comments.forEach((comment) => {
    const parsed = parseSystemActivityComment(comment);
    if (parsed) pushEvent(parsed);
  });

  if (isDone(task) && !events.some((event) => event.type === 'done')) {
    pushEvent({
      id: 'done-current',
      type: 'done',
      title: 'Demanda concluída',
      meta: task.completedByName || task.assigneeName || 'Responsável',
      createdAt: task.updatedAt,
    });
  }

  if (task.updatedAt) {
    pushEvent({
      id: 'updated',
      type: 'updated',
      title: 'Última atualização',
      meta: formatDateTime(task.updatedAt),
      createdAt: task.updatedAt,
      quiet: true,
    });
  }

  const timeValue = (event) => {
    if (!event.createdAt) return 0;
    const date = new Date(event.createdAt);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  };

  return events.sort((a, b) => timeValue(b) - timeValue(a));
}

function metaValue(value) {
  return value || '—';
}

function isTaskOwner(user, task) {
  if (!user?.id || !task) return false;
  return task.assigneeUserId === user.id || task.createdByUserId === user.id;
}

function canCreateProfileTask(user) {
  return hasPermission(user, 'tasks.create');
}

function canEditProfileTask(user, task) {
  if (!task) return false;
  if (hasPermission(user, 'tasks.edit.all')) return true;
  if (!hasPermission(user, 'tasks.edit.own')) return false;
  if (task.profileRelation === 'collaborator') return false;
  return isTaskOwner(user, task) || task.profileRelation === 'responsible';
}

function canCommentProfileTask(user, task) {
  if (!task) return false;
  return hasPermission(user, 'tasks.comment.all') || hasPermission(user, 'tasks.comment.own');
}

function canCompleteProfileTask(user, task) {
  if (!task) return false;
  if (hasPermission(user, 'tasks.complete.any') || hasPermission(user, 'tasks.edit.all')) return true;
  if (canEditProfileTask(user, task)) return true;
  return hasPermission(user, 'tasks.complete.own') && isTaskOwner(user, task);
}

function canDeleteProfileComment(user, comment) {
  if (!comment) return false;
  return hasPermission(user, 'tasks.comment.all') || hasPermission(user, 'tasks.edit.all') || comment.userId === user?.id;
}


function Select({ value, onChange, children, className = '', disabled = false, placeholder = 'Selecionar', type = 'default', ...props }) {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);

  const options = useMemo(() => {
    const items = [];

    function collect(nodes) {
      (Array.isArray(nodes) ? nodes : [nodes]).forEach((node) => {
        if (!node) return;
        if (Array.isArray(node)) {
          collect(node);
          return;
        }
        if (node?.type === 'option') {
          const label = Array.isArray(node.props.children)
            ? node.props.children.join('')
            : String(node.props.children ?? '');
          items.push({
            value: String(node.props.value ?? ''),
            label,
            disabled: Boolean(node.props.disabled),
            avatar: node.props['data-avatar'] || '',
            avatarName: node.props['data-name'] || label,
          });
          return;
        }
        if (node?.props?.children) collect(node.props.children);
      });
    }

    collect(children);
    return items;
  }, [children]);

  const selected = options.find((option) => option.value === String(value ?? ''));
  const ariaLabel = props['aria-label'] || props.ariaLabel || placeholder;
  const isIdentity = ['user', 'gdv', 'squad', 'client'].includes(type);
  const shouldShowAvatar = (option) => isIdentity && option && (option.value !== '' || option.avatar);

  function computePosition() {
    const anchor = buttonRef.current;
    if (!anchor || typeof window === 'undefined') return null;

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const width = Math.min(Math.max(rect.width, 220), Math.max(220, viewportWidth - 24));
    const left = Math.max(12, Math.min(rect.left, viewportWidth - width - 12));
    const spaceBelow = viewportHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const maxHeight = Math.max(150, Math.min(280, Math.max(spaceBelow, spaceAbove)));
    const top = spaceBelow >= 168 || spaceBelow >= spaceAbove
      ? rect.bottom + 6
      : Math.max(12, rect.top - maxHeight - 6);

    return {
      top: Math.round(top),
      left: Math.round(left),
      width: Math.round(width),
      maxHeight: Math.round(maxHeight),
    };
  }

  function updatePosition() {
    const next = computePosition();
    if (next) setPosition(next);
    return next;
  }

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (buttonRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function selectValue(nextValue) {
    onChange?.({ target: { value: nextValue } });
    setOpen(false);
  }

  return (
    <div className={`${styles.profileSelect} ${className || ''}`.trim()}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.profileSelectButton}
        onClick={() => {
          if (disabled) return;
          if (open) {
            setOpen(false);
            return;
          }
          const next = updatePosition();
          if (next) setOpen(true);
        }}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {shouldShowAvatar(selected) ? (
          <Avatar
            src={selected.avatar || undefined}
            name={selected.avatarName}
            size="xs"
            className={styles.profileSelectAvatar}
          />
        ) : null}
        <span>{selected?.label || placeholder}</span>
      </button>
      {open && position ? createPortal(
        <div
          ref={menuRef}
          className={styles.profileSelectMenu}
          style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option) => (
            <button
              key={`${option.value}-${option.label}`}
              type="button"
              className={`${styles.profileSelectOption} ${String(value ?? '') === option.value ? styles.profileSelectOptionActive : ''}`.trim()}
              onClick={() => !option.disabled && selectValue(option.value)}
              disabled={option.disabled}
              role="option"
              aria-selected={String(value ?? '') === option.value}
            >
              {shouldShowAvatar(option) ? (
                <Avatar
                  src={option.avatar || undefined}
                  name={option.avatarName}
                  size="xs"
                  className={styles.profileSelectAvatar}
                />
              ) : null}
              <span>{option.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export default function ProfilePage() {
  const { setPanelHeader, squads = [] } = useOutletContext();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, reloadUser } = useAuth();
  const { showToast } = useToast();
  const avatarInputRef = useRef(null);
  const demandAttachmentInputRef = useRef(null);
  const taskAttachmentInputRef = useRef(null);
  const clientSearchRef = useRef(null);
  const clientSearchPanelRef = useRef(null);
  const taskDeepLinkHandledRef = useRef('');

  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    avatarColor: user?.avatarColor || 'amber',
    customSlug: user?.customSlug || '',
  });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('profile');
  const [operationTab, setOperationTab] = useState('all');
  const [operationPage, setOperationPage] = useState(1);
  const [tasks, setTasks] = useState([]);
  const [taskPeopleMap, setTaskPeopleMap] = useState({});
  const [taskUpdatingId, setTaskUpdatingId] = useState('');
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(() => getUserAvatar(user));
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState('');
  const [demandModalOpen, setDemandModalOpen] = useState(false);
  const [demandForm, setDemandForm] = useState(() => emptyDemandForm(user?.id || ''));
  const [demandUsers, setDemandUsers] = useState([]);
  const [demandClients, setDemandClients] = useState([]);
  const [demandSaving, setDemandSaving] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [clientSearchPosition, setClientSearchPosition] = useState(null);
  const [taskComments, setTaskComments] = useState([]);
  const [taskEvents, setTaskEvents] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentAttachments, setCommentAttachments] = useState([]);
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentDeleteTarget, setCommentDeleteTarget] = useState(null);
  const [commentDeleting, setCommentDeleting] = useState(false);
  const [subtaskDeleteTarget, setSubtaskDeleteTarget] = useState(null);
  const [subtaskDeleting, setSubtaskDeleting] = useState(false);
  const [taskDeleteTarget, setTaskDeleteTarget] = useState(null);
  const [taskDeleting, setTaskDeleting] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [subtaskSaving, setSubtaskSaving] = useState(false);
  const [drawerSubtasks, setDrawerSubtasks] = useState([]);
  const [subtasksLoading, setSubtasksLoading] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffForm, setHandoffForm] = useState(() => emptyHandoffForm(user?.id || ''));
  const [handoffSaving, setHandoffSaving] = useState(false);
  const [completionTarget, setCompletionTarget] = useState(null);
  const [completionForm, setCompletionForm] = useState({ result: '', pending: '', nextAction: '', notes: '' });
  const [completionSaving, setCompletionSaving] = useState(false);
  const [contentEditing, setContentEditing] = useState(false);
  const [contentSaving, setContentSaving] = useState(false);
  const [descriptionEditing, setDescriptionEditing] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState('');
  const [editingCommentDraft, setEditingCommentDraft] = useState('');
  const [commentEditSavingId, setCommentEditSavingId] = useState('');
  const [activityPage, setActivityPage] = useState(1);
  const [descriptionCopied, setDescriptionCopied] = useState(false);
  const [taskAttachments, setTaskAttachments] = useState([]);
  const [taskAttachmentsLoading, setTaskAttachmentsLoading] = useState(false);
  const [taskAttachmentDeletingId, setTaskAttachmentDeletingId] = useState('');
  const [taskAttachmentDeleteTarget, setTaskAttachmentDeleteTarget] = useState(null);
  const [taskAttachmentPreview, setTaskAttachmentPreview] = useState(null);
  const [taskAttachmentZoom, setTaskAttachmentZoom] = useState(1);
  const [taskAttachmentZoomOrigin, setTaskAttachmentZoomOrigin] = useState('50% 50%');
  const [taskPdfBlobUrl, setTaskPdfBlobUrl] = useState('');
  const [taskAttachmentsAlbumOpen, setTaskAttachmentsAlbumOpen] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);
  const [collaboratorUserId, setCollaboratorUserId] = useState('');
  const [collaboratorSaving, setCollaboratorSaving] = useState(false);
  const [collaboratorRemovingId, setCollaboratorRemovingId] = useState('');
  const [contentForm, setContentForm] = useState({
    title: '',
    description: '',
    officeName: '',
    objective: '',
    campaign: '',
    channels: '',
    attendants: '',
    greeting: '',
    location: '',
    notes: '',
    recurrence: '',
    routineScope: '',
    routineChecklist: '',
  });

  useEffect(() => {
    setPanelHeader({ title: 'Perfil', description: null, actions: null });
  }, [setPanelHeader]);

  useEffect(() => {
    setTaskAttachmentZoom(1);
    setTaskAttachmentZoomOrigin('50% 50%');
  }, [taskAttachmentPreview?.id]);

  // PDFs com imagens/scans geram data: URLs grandes que estouram o limite de
  // URL do navegador e renderizam em branco no iframe. Convertemos para Blob URL.
  useEffect(() => {
    if (taskAttachmentPreview?.mimeType !== 'application/pdf' || !taskAttachmentPreview?.dataUrl) {
      setTaskPdfBlobUrl('');
      return undefined;
    }

    let url = '';
    try {
      const [meta, base64 = ''] = String(taskAttachmentPreview.dataUrl).split(',');
      const isBase64 = /;base64/i.test(meta);
      const binary = isBase64 ? atob(base64) : decodeURIComponent(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      setTaskPdfBlobUrl(url);
    } catch {
      setTaskPdfBlobUrl('');
    }

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [taskAttachmentPreview?.id, taskAttachmentPreview?.mimeType, taskAttachmentPreview?.dataUrl]);

  useEffect(() => {
    setProfileForm({
      name: user?.name || '',
      phone: user?.phone || '',
      avatarColor: user?.avatarColor || 'amber',
      customSlug: user?.customSlug || '',
    });
  }, [user?.name, user?.phone, user?.avatarColor, user?.customSlug]);

  useEffect(() => {
    setDemandForm((prev) => ({ ...prev, assigneeUserId: prev.assigneeUserId || user?.id || '' }));
  }, [user?.id]);

  useEffect(() => {
    setAvatarUrl(getUserAvatar(user));
    return subscribeAvatarChange(() => setAvatarUrl(getUserAvatar(user)));
  }, [user]);

  function resetDrawerState() {
    setCommentDraft('');
    setSubtaskDraft('');
    setTaskComments([]);
    setTaskEvents([]);
    setDrawerSubtasks([]);
    setTaskAttachments([]);
    setTaskAttachmentPreview(null);
    setCollaborators([]);
    setCollaboratorUserId('');
    setCommentDeleteTarget(null);
    setSubtaskDeleteTarget(null);
    setTaskDeleteTarget(null);
    setCompletionTarget(null);
    setDescriptionEditing(false);
    setDescriptionExpanded(false);
    setDescriptionDraft('');
    setEditingCommentId('');
    setEditingCommentDraft('');
    setActivityPage(1);
    setCompletionForm({ result: '', pending: '', nextAction: '', notes: '' });
    setHandoffOpen(false);
    setHandoffForm(emptyHandoffForm(user?.id || ''));
    setContentEditing(false);
    setContentForm({
      title: '',
      description: '',
      officeName: '',
      objective: '',
      campaign: '',
      channels: '',
      attendants: '',
      greeting: '',
      location: '',
      notes: '',
      recurrence: '',
      routineScope: '',
      routineChecklist: '',
    });
  }

  function closeActiveTaskDrawer() {
    setActiveTaskId('');
    resetDrawerState();
  }

  function resetDemandModalState() {
    setClientQuery('');
    setClientSearchOpen(false);
    setClientSearchPosition(null);
    setDemandForm(emptyDemandForm(user?.id || ''));
    if (demandAttachmentInputRef.current) demandAttachmentInputRef.current.value = '';
  }

  function closeDemandModal() {
    setDemandModalOpen(false);
    resetDemandModalState();
  }

  function closeSettingsModal() {
    setSettingsOpen(false);
    setSettingsTab('profile');
    setPasswordForm({ currentPassword: '', newPassword: '' });
    setProfileForm({
      name: user?.name || '',
      phone: user?.phone || '',
      avatarColor: user?.avatarColor || 'amber',
      customSlug: user?.customSlug || '',
    });
  }

  function closeCompletionModal() {
    setCompletionTarget(null);
    setCompletionForm({ result: '', pending: '', nextAction: '', notes: '' });
  }

  function closeHandoffModal() {
    setHandoffOpen(false);
    setHandoffForm(emptyHandoffForm(user?.id || activeTask?.assigneeUserId || ''));
  }

  function closeCommentDeleteModal() {
    setCommentDeleteTarget(null);
  }

  function closeSubtaskDeleteModal() {
    setSubtaskDeleteTarget(null);
  }

  function closeTaskDeleteModal() {
    setTaskDeleteTarget(null);
  }

  function updateClientSearchPosition() {
    const field = clientSearchRef.current;
    if (!field) return null;

    const rect = field.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const preferredWidth = Math.max(rect.width, 320);
    const safeWidth = Math.min(preferredWidth, Math.max(280, viewportWidth - 24));
    const safeLeft = Math.max(12, Math.min(rect.left, viewportWidth - safeWidth - 12));
    const spaceBelow = viewportHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const maxHeight = Math.max(150, Math.min(280, Math.max(spaceBelow, spaceAbove)));
    const safeTop = spaceBelow >= 160 || spaceBelow >= spaceAbove
      ? rect.bottom + 6
      : Math.max(12, rect.top - maxHeight - 6);

    const nextPosition = {
      top: Math.round(safeTop),
      left: Math.round(safeLeft),
      width: Math.round(safeWidth),
      maxHeight: Math.round(maxHeight),
    };

    setClientSearchPosition(nextPosition);
    return nextPosition;
  }

  function openClientSearch() {
    const nextPosition = updateClientSearchPosition();
    if (nextPosition) setClientSearchOpen(true);
  }

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([listUserDirectory(), listClients()]).then(([usersRes, clientsRes]) => {
      if (cancelled) return;
      if (usersRes.status === 'fulfilled') {
        setDemandUsers(Array.isArray(usersRes.value?.users) ? usersRes.value.users : []);
      }
      if (clientsRes.status === 'fulfilled') {
        setDemandClients(Array.isArray(clientsRes.value?.clients) ? clientsRes.value.clients : []);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTasksLoading(true);
    setTasksError('');

    listMyProjectTasks()
      .then((res) => {
        if (!cancelled) setTasks(Array.isArray(res?.tasks) ? res.tasks : []);
      })
      .catch((err) => {
        if (!cancelled) setTasksError(err?.message || 'Erro');
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const taskId = params.get('task');

    if (!taskId) {
      taskDeepLinkHandledRef.current = '';
      return undefined;
    }

    if (tasksLoading) return undefined;

    taskDeepLinkHandledRef.current = taskId;
    let cancelled = false;

    function clearTaskParam() {
      const nextParams = new URLSearchParams(location.search);
      nextParams.delete('task');
      const nextSearch = nextParams.toString();
      const nextUrl = `${location.pathname}${nextSearch ? `?${nextSearch}` : ''}${location.hash || ''}`;
      navigate(nextUrl, { replace: true });
    }

    function openTaskFromDeepLink(task) {
      setTasks((prev) => (prev.some((item) => item.id === task.id) ? prev.map((item) => (item.id === task.id ? { ...item, ...task } : item)) : [task, ...prev]));
      setActiveTaskId(task.id);
      if (task.profileRelation === 'collaborator') setOperationTab('watching');
      else if (isDone(task)) setOperationTab('done');
      setOperationPage(1);
    }

    const taskFromList = tasks.find((task) => task.id === taskId);

    if (taskFromList) {
      openTaskFromDeepLink(taskFromList);
      clearTaskParam();
      return undefined;
    }

    getTask(taskId)
      .then((res) => {
        if (cancelled) return;
        const task = res?.task;
        if (!task?.id) {
          showToast('Demanda não encontrada ou sem acesso.', { variant: 'error' });
          return;
        }
        openTaskFromDeepLink(task);
      })
      .catch((err) => {
        if (!cancelled) showToast(err?.message || 'Demanda não encontrada ou sem acesso.', { variant: 'error' });
      })
      .finally(() => {
        if (!cancelled) clearTaskParam();
      });

    return () => {
      cancelled = true;
    };
  }, [location.hash, location.pathname, location.search, navigate, showToast, tasks, tasksLoading]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return;
      if (commentDeleteTarget) {
        closeCommentDeleteModal();
        return;
      }
      if (subtaskDeleteTarget) {
        closeSubtaskDeleteModal();
        return;
      }
      if (taskDeleteTarget) {
        closeTaskDeleteModal();
        return;
      }
      if (completionTarget) {
        closeCompletionModal();
        return;
      }
      if (handoffOpen) {
        closeHandoffModal();
        return;
      }
      if (demandModalOpen) {
        closeDemandModal();
        return;
      }
      if (settingsOpen) {
        closeSettingsModal();
        return;
      }
      closeActiveTaskDrawer();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  useEffect(() => {
    if (!clientSearchOpen) return undefined;

    if (!updateClientSearchPosition()) {
      setClientSearchOpen(false);
      return undefined;
    }

    function handlePointerDown(event) {
      if (clientSearchRef.current?.contains(event.target)) return;
      if (clientSearchPanelRef.current?.contains(event.target)) return;
      setClientSearchOpen(false);
    }

    function handleViewportChange() {
      if (!updateClientSearchPosition()) setClientSearchOpen(false);
    }

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [clientSearchOpen]);

  useEffect(() => {
    if (demandModalOpen) return;
    setClientSearchOpen(false);
    setClientSearchPosition(null);
  }, [demandModalOpen]);

  useEffect(() => {
    resetDrawerState();

    if (!activeTaskId) return undefined;

    let cancelled = false;
    setCommentsLoading(true);
    setSubtasksLoading(true);
    setCollaboratorsLoading(true);
    setTaskAttachmentsLoading(true);

    Promise.allSettled([listTaskComments(activeTaskId), listTaskEvents(activeTaskId), listTaskSubtasks(activeTaskId), listTaskCollaborators(activeTaskId), listTaskAttachments(activeTaskId)])
      .then(([commentsRes, eventsRes, subtasksRes, collaboratorsRes, attachmentsRes]) => {
        if (cancelled) return;
        const allRejected = [commentsRes, eventsRes, subtasksRes, collaboratorsRes, attachmentsRes].every((result) => result.status === 'rejected');
        if (allRejected) {
          closeActiveTaskDrawer();
          showToast('Não foi possível carregar esta demanda.', { variant: 'error' });
          return;
        }

        if (commentsRes.status === 'fulfilled') {
          setTaskComments(Array.isArray(commentsRes.value?.comments) ? commentsRes.value.comments : []);
        } else {
          setTaskComments([]);
        }
        if (eventsRes.status === 'fulfilled') {
          setTaskEvents(Array.isArray(eventsRes.value?.events) ? eventsRes.value.events : []);
        } else {
          setTaskEvents([]);
        }
        if (subtasksRes.status === 'fulfilled') {
          setDrawerSubtasks(Array.isArray(subtasksRes.value?.subtasks) ? subtasksRes.value.subtasks : []);
        } else {
          setDrawerSubtasks([]);
        }
        if (collaboratorsRes.status === 'fulfilled') {
          setCollaborators(Array.isArray(collaboratorsRes.value?.collaborators) ? collaboratorsRes.value.collaborators : []);
        } else {
          setCollaborators([]);
        }
        if (attachmentsRes.status === 'fulfilled') {
          setTaskAttachments(Array.isArray(attachmentsRes.value?.attachments) ? attachmentsRes.value.attachments : []);
        } else {
          setTaskAttachments([]);
    setTaskAttachmentPreview(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCommentsLoading(false);
          setSubtasksLoading(false);
          setCollaboratorsLoading(false);
          setTaskAttachmentsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTaskId]);

  const squadNames = useMemo(() => {
    const map = new Map((squads || []).map((item) => [item.id, item.name]));
    return (user?.squads || []).map((id) => map.get(id) || id);
  }, [squads, user?.squads]);

  const operationCounts = useMemo(() => getOperationCounts(tasks), [tasks]);
  const tabTasks = useMemo(() => getVisibleTasks(tasks, operationTab), [operationTab, tasks]);
  const operationTotalPages = Math.max(1, Math.ceil(tabTasks.length / OPERATION_PAGE_SIZE));
  const safeOperationPage = Math.min(operationPage, operationTotalPages);
  const visibleTasks = useMemo(() => {
    const start = (safeOperationPage - 1) * OPERATION_PAGE_SIZE;
    return tabTasks.slice(start, start + OPERATION_PAGE_SIZE);
  }, [safeOperationPage, tabTasks]);
  const operationRangeStart = tabTasks.length ? ((safeOperationPage - 1) * OPERATION_PAGE_SIZE) + 1 : 0;
  const operationRangeEnd = tabTasks.length ? Math.min(tabTasks.length, safeOperationPage * OPERATION_PAGE_SIZE) : 0;
  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) || null, [activeTaskId, tasks]);

  useEffect(() => {
    const pendingTasks = visibleTasks.filter((task) => task?.id && !Object.prototype.hasOwnProperty.call(taskPeopleMap, task.id));
    if (!pendingTasks.length) return undefined;

    let cancelled = false;

    Promise.allSettled(
      pendingTasks.map((task) => listTaskCollaborators(task.id))
    ).then((results) => {
      if (cancelled) return;
      setTaskPeopleMap((prev) => {
        const next = { ...prev };
        results.forEach((result, index) => {
          const task = pendingTasks[index];
          const collaborators = result.status === 'fulfilled' && Array.isArray(result.value?.collaborators)
            ? result.value.collaborators
            : buildTaskPeople(task, demandUsers);
          next[task.id] = collaborators;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [demandUsers, taskPeopleMap, visibleTasks]);

  useEffect(() => {
    setOperationPage(1);
  }, [operationTab]);

  useEffect(() => {
    if (!activeTaskId || tasksLoading) return undefined;
    if (tasks.some((task) => task.id === activeTaskId)) return undefined;

    let cancelled = false;

    getTask(activeTaskId)
      .then((res) => {
        if (cancelled) return;
        const task = res?.task;
        if (!task?.id) {
          closeActiveTaskDrawer();
          return;
        }
        setTasks((prev) => (prev.some((item) => item.id === task.id) ? prev.map((item) => (item.id === task.id ? { ...item, ...task } : item)) : [task, ...prev]));
        if (task.profileRelation === 'collaborator') setOperationTab('watching');
        else if (isDone(task)) setOperationTab('done');
      })
      .catch(() => {
        if (cancelled) return;
        closeActiveTaskDrawer();
        showToast('A demanda aberta não está mais disponível.', { variant: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [activeTaskId, showToast, tasks, tasksLoading]);

  useEffect(() => {
    if (operationPage > operationTotalPages) setOperationPage(operationTotalPages);
  }, [operationPage, operationTotalPages]);


  const activeSubtasks = useMemo(() => {
    if (!activeTask) return [];
    const merged = new Map();
    tasks.filter((task) => task.parentTaskId === activeTask.id).forEach((task) => merged.set(task.id, task));
    drawerSubtasks.forEach((task) => merged.set(task.id, { ...(merged.get(task.id) || {}), ...task }));
    return Array.from(merged.values()).sort(compareOperationTasks);
  }, [activeTask, drawerSubtasks, tasks]);
  const collaboratorOptions = useMemo(() => {
    if (!activeTask) return [];
    const usedIds = new Set([
      activeTask.assigneeUserId,
      activeTask.assignee_user_id,
      activeTask.createdByUserId,
      activeTask.created_by_user_id,
      ...collaborators.map((item) => item.userId),
    ].filter(Boolean));

    return demandUsers
      .filter((item) => item?.id && !usedIds.has(item.id))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
  }, [activeTask, collaborators, demandUsers]);
  const visibleTaskComments = useMemo(() => taskComments.filter((comment) => !isSystemActivityComment(comment)), [taskComments]);
  const activeActivityEvents = useMemo(() => buildActivityEvents(activeTask, taskComments, taskEvents), [activeTask, taskComments, taskEvents]);
  const ACTIVITY_PAGE_SIZE = 5;
  const activityTotalPages = Math.max(1, Math.ceil(activeActivityEvents.length / ACTIVITY_PAGE_SIZE));
  const safeActivityPage = Math.min(activityPage, activityTotalPages);
  const visibleActivityEvents = activeActivityEvents.slice((safeActivityPage - 1) * ACTIVITY_PAGE_SIZE, safeActivityPage * ACTIVITY_PAGE_SIZE);

  useEffect(() => {
    setActivityPage(1);
  }, [activeTaskId, activeActivityEvents.length]);
  const completionRate = tasks.length ? Math.round((operationCounts.done / tasks.length) * 100) : 0;
  const profileDate = useMemo(() => new Date(), []);
  const profileStats = useMemo(() => ([
    { label: 'Total de tarefas', value: operationCounts.all, hint: 'no perfil', tone: 'neutral', Icon: ChecklistIcon },
    { label: 'Acompanhando', value: operationCounts.watching, hint: 'colaborações', tone: 'blue', Icon: UsersIcon },
    { label: 'Em aberto', value: operationCounts.open, hint: `${operationCounts.today} para hoje`, tone: 'amber', Icon: CalendarIcon },
    { label: 'Risco operacional', value: operationCounts.risk, hint: `${operationCounts.overdue} atrasadas`, tone: 'red', Icon: BellIcon },
    { label: 'Taxa de conclusão', value: `${completionRate}%`, hint: `${operationCounts.done} concluídas`, tone: 'completion', Icon: TargetIcon },
  ]), [completionRate, operationCounts.all, operationCounts.done, operationCounts.open, operationCounts.overdue, operationCounts.risk, operationCounts.today, operationCounts.watching]);
  const canCreateDemand = canCreateProfileTask(user);
  const canEditActiveTask = canEditProfileTask(user, activeTask);
  const canCommentActiveTask = canCommentProfileTask(user, activeTask);
  const canCompleteActiveTask = canCompleteProfileTask(user, activeTask);
  const canManageActiveCollaborators = canEditActiveTask;
  const canCreateActiveSubtask = canCreateDemand && canEditActiveTask;

  async function refreshActiveTaskPanels(taskId = activeTaskId, options = {}) {
    if (!taskId || taskId !== activeTaskId) return;

    const { comments = false, events = true, subtasks = false, collaborators: shouldRefreshCollaborators = false, attachments = false } = options;
    const requests = [];

    if (comments) {
      requests.push(
        listTaskComments(taskId)
          .then((res) => setTaskComments(Array.isArray(res?.comments) ? res.comments : []))
          .catch(() => {})
      );
    }

    if (events) {
      requests.push(
        listTaskEvents(taskId)
          .then((res) => setTaskEvents(Array.isArray(res?.events) ? res.events : []))
          .catch(() => {})
      );
    }

    if (subtasks) {
      requests.push(
        listTaskSubtasks(taskId)
          .then((res) => setDrawerSubtasks(Array.isArray(res?.subtasks) ? res.subtasks : []))
          .catch(() => {})
      );
    }

    if (shouldRefreshCollaborators) {
      requests.push(
        listTaskCollaborators(taskId)
          .then((res) => setCollaborators(Array.isArray(res?.collaborators) ? res.collaborators : []))
          .catch(() => {})
      );
    }

    if (attachments) {
      requests.push(
        listTaskAttachments(taskId)
          .then((res) => setTaskAttachments(Array.isArray(res?.attachments) ? res.attachments : []))
          .catch(() => {})
      );
    }

    await Promise.allSettled(requests);
  }

  async function handleSaveProfile() {
    try {
      setSavingProfile(true);
      await updateProfile(profileForm);
      await reloadUser();
      showToast('Perfil atualizado.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao salvar.', { variant: 'error' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    try {
      setSavingPassword(true);
      await changePassword(passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      showToast('Senha atualizada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao alterar senha.', { variant: 'error' });
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleAvatarFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const dataUrl = await readAvatarFile(file);
      await updateProfile({ avatarUrl: dataUrl });
      await reloadUser();
      const saved = saveUserAvatar(user, dataUrl) || true;
      if (!saved) throw new Error('Erro');
      setAvatarUrl(dataUrl);
      showToast('Foto atualizada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao salvar foto.', { variant: 'error' });
    }
  }

  async function handleRemoveAvatar() {
    try {
      await updateProfile({ avatarUrl: '' });
      await reloadUser();
      removeUserAvatar(user);
      setAvatarUrl('');
      showToast('Foto removida.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao remover foto.', { variant: 'error' });
    }
  }

  async function handleUpdateTaskFields(task, patch, successMessage = 'Demanda atualizada.') {
    if (!task?.id) return;
    if (!canEditProfileTask(user, task)) {
      showToast('Sem permissão para editar esta demanda.', { variant: 'error' });
      return;
    }

    try {
      setTaskUpdatingId(task.id);
      const res = await updateProjectTask(task.id, patch);
      const nextTask = res?.task || { ...task, ...patch };
      setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, ...nextTask } : item)));
      await refreshActiveTaskPanels(task.id, { events: true });
      showToast(successMessage, { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao atualizar demanda.', { variant: 'error' });
    } finally {
      setTaskUpdatingId('');
    }
  }

  function openContentEditor(task = activeTask) {
    if (!task) return;
    if (!canEditProfileTask(user, task)) {
      showToast('Sem permissão para editar esta demanda.', { variant: 'error' });
      return;
    }
    const kind = getTaskKind(task);
    const briefing = kind === 'briefing' ? parseBriefingDescription(task.description || '') : null;
    const routine = kind === 'routine' ? parseRoutineDescription(task.description || '') : null;

    setContentForm({
      title: task.title || '',
      description: briefing ? briefing.extraDescription : routine ? routine.extraDescription : task.description || '',
      officeName: briefing?.values.officeName || '',
      objective: briefing?.values.objective || '',
      campaign: briefing?.values.campaign || '',
      channels: briefing?.values.channels || '',
      attendants: briefing?.values.attendants || '',
      greeting: briefing?.values.greeting || '',
      location: briefing?.values.location || '',
      notes: briefing?.values.notes || '',
      recurrence: routine?.values.recurrence || 'Diária',
      routineScope: routine?.values.scope || '',
      routineChecklist: routine?.values.checklist || '',
    });
    setContentEditing(true);
  }

  function buildContentDescription(task, form) {
    const kind = getTaskKind(task);
    const lines = [];

    if (kind === 'briefing') {
      lines.push('Tipo: Briefing');
      if (task?.clientName) lines.push(`Cliente: ${task.clientName}`);
      lines.push('', 'Briefing');
      [
        ['Nome do escritório', form.officeName],
        ['Objetivo', form.objective],
        ['Nicho/campanha', form.campaign],
        ['Canais', form.channels],
        ['Atendentes', form.attendants],
        ['Saudação', form.greeting],
        ['Localização', form.location],
        ['Observações', form.notes],
      ].forEach(([label, value]) => {
        const cleanValue = String(value || '').trim();
        if (cleanValue) lines.push(`${label}: ${cleanValue}`);
      });
    } else if (kind === 'routine') {
      lines.push('Tipo: Rotina');
      if (task?.clientName) lines.push(`Cliente: ${task.clientName}`);
      lines.push('', 'Rotina');
      [
        ['Recorrência', form.recurrence],
        ['Escopo', form.routineScope],
        ['Checklist', form.routineChecklist],
      ].forEach(([label, value]) => {
        const cleanValue = String(value || '').trim();
        if (cleanValue) lines.push(`${label}: ${cleanValue}`);
      });
    }

    const extra = String(form.description || '').trim();
    if (extra) lines.push('', extra);

    return lines.join('\n').trim();
  }

  async function handleSaveContent(event) {
    event.preventDefault();
    if (!activeTask?.id) return;
    if (!canEditActiveTask) {
      showToast('Sem permissão para editar esta demanda.', { variant: 'error' });
      return;
    }

    const nextTitle = contentForm.title.trim();
    if (!nextTitle) {
      showToast('Título obrigatório.', { variant: 'error' });
      return;
    }

    try {
      setContentSaving(true);
      const nextDescription = buildContentDescription(activeTask, contentForm);
      const res = await updateProjectTask(activeTask.id, { title: nextTitle, description: nextDescription });
      const nextTask = res?.task || { ...activeTask, title: nextTitle, description: nextDescription };
      setTasks((prev) => prev.map((item) => (item.id === activeTask.id ? { ...item, ...nextTask } : item)));
      await refreshActiveTaskPanels(activeTask.id, { events: true });
      setContentEditing(false);
      showToast('Demanda atualizada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao salvar conteúdo.', { variant: 'error' });
    } finally {
      setContentSaving(false);
    }
  }

  function openDescriptionEditor() {
    if (!activeTask || !canEditActiveTask) return;
    setDescriptionDraft(String(activeDescription || ''));
    setDescriptionEditing(true);
  }

  async function saveDescriptionDraft() {
    if (!activeTask?.id || !descriptionEditing || contentSaving) return;
    const current = String(activeDescription || '').trim();
    const next = String(descriptionDraft || '').trim();
    if (next === current) {
      setDescriptionEditing(false);
      return;
    }

    try {
      setContentSaving(true);
      const nextDescription = buildContentDescription(activeTask, { ...contentForm, description: next });
      const res = await updateProjectTask(activeTask.id, { description: nextDescription });
      const nextTask = res?.task || { ...activeTask, description: nextDescription };
      setTasks((prev) => prev.map((item) => (item.id === activeTask.id ? { ...item, ...nextTask } : item)));
      await refreshActiveTaskPanels(activeTask.id, { events: true });
      setDescriptionEditing(false);
    } catch (err) {
      showToast(err?.message || 'Erro ao salvar descrição.', { variant: 'error' });
    } finally {
      setContentSaving(false);
    }
  }

  function openCommentEditor(comment) {
    if (!activeTask || !comment?.id || !canDeleteProfileComment(user, comment)) return;
    setEditingCommentId(comment.id);
    setEditingCommentDraft(commentDisplayBody(comment));
  }

  async function saveCommentEditor(comment) {
    if (!activeTask?.id || !comment?.id || commentEditSavingId) return;
    const nextBody = String(editingCommentDraft || '').trim();
    const currentBody = commentDisplayBody(comment).trim();
    if (!nextBody || nextBody === currentBody) {
      setEditingCommentId('');
      setEditingCommentDraft('');
      return;
    }

    try {
      setCommentEditSavingId(comment.id);
      const attachmentMarker = commentAttachmentIds(comment).length
        ? `${COMMENT_ATTACHMENT_MARKER}${commentAttachmentIds(comment).join(',')}]]`
        : '';
      const res = await updateTaskComment(activeTask.id, comment.id, {
        body: [nextBody, attachmentMarker].filter(Boolean).join('\n'),
      });
      const updated = res?.comment || { ...comment, body: [nextBody, attachmentMarker].filter(Boolean).join('\n') };
      setTaskComments((prev) => prev.map((item) => (item.id === comment.id ? { ...item, ...updated } : item)));
      await refreshActiveTaskPanels(activeTask.id, { events: true });
      setEditingCommentId('');
      setEditingCommentDraft('');
    } catch (err) {
      showToast(err?.message || 'Erro ao salvar comentário.', { variant: 'error' });
    } finally {
      setCommentEditSavingId('');
    }
  }


  async function handleCopyDescription() {
    const text = String(activeDescription || '').trim();
    if (!text) return;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setDescriptionCopied(true);
      window.setTimeout(() => setDescriptionCopied(false), 1400);
      showToast('Descrição copiada.', { variant: 'success' });
    } catch (err) {
      showToast('Erro ao copiar descrição.', { variant: 'error' });
    }
  }

  function buildCompletionPrefill(task) {
    const openSubtasks = (task?.id ? drawerSubtasks.filter((item) => item.parentTaskId === task.id && !isDone(item)) : [])
      .map((item) => item.title)
      .filter(Boolean);
    const kind = getTaskKind(task);
    const result = kind === 'briefing'
      ? 'Implementação concluída no CRM/IA.'
      : kind === 'routine'
        ? 'Rotina executada.'
        : 'Demanda concluída.';

    return {
      result,
      pending: openSubtasks.length ? openSubtasks.map((title) => `- ${title}`).join('\n') : '',
      nextAction: kind === 'briefing'
        ? 'Avisar responsável para seguir com a próxima etapa da ativação.'
        : '',
      notes: '',
    };
  }

  function buildCompletionRecord(task, form) {
    const kind = getTaskKind(task);
    const header = kind === 'briefing' ? 'Implementação concluída.' : 'Demanda concluída.';
    const lines = [header];

    const details = [
      ['Resultado', form.result],
      ['Pendências', form.pending],
      ['Próxima ação', form.nextAction],
      ['Observações', form.notes],
    ].filter(([, value]) => String(value || '').trim());

    if (details.length) {
      lines.push('', 'Registro de conclusão');
      details.forEach(([label, value]) => {
        lines.push(`${label}: ${String(value || '').trim()}`);
      });
    }

    return lines.join('\n').trim();
  }

  async function handleToggleTask(task) {
    if (!task?.id) return;
    if (!canCompleteProfileTask(user, task)) {
      showToast('Sem permissão para alterar o status desta demanda.', { variant: 'error' });
      return;
    }

    if (!isDone(task) && !task.parentTaskId) {
      setCompletionTarget(task);
      setCompletionForm(buildCompletionPrefill(task));
      return;
    }

    try {
      setTaskUpdatingId(task.id);
      const nextDone = !isDone(task);
      const nextStatus = nextDone ? 'done' : 'todo';
      await updateProjectTask(task.id, { done: nextDone, status: nextStatus });
      setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, done: nextDone, status: nextStatus } : item)));
      setDrawerSubtasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, done: nextDone, status: nextStatus } : item)));
      await refreshActiveTaskPanels(task.parentTaskId ? activeTaskId : task.id, { events: true, subtasks: Boolean(task.parentTaskId) });
      showToast(nextDone ? 'Tarefa concluída.' : 'Tarefa reaberta.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao atualizar tarefa.', { variant: 'error' });
    } finally {
      setTaskUpdatingId('');
    }
  }

  function handleChangeTaskStatus(task, nextStatus) {
    if (!task?.id) return;

    if (!canEditProfileTask(user, task)) {
      showToast('Sem permissão para alterar o status desta demanda.', { variant: 'error' });
      return;
    }

    const shouldCompleteWithRecord = nextStatus === 'done' && !isDone(task) && !task.parentTaskId;
    if (shouldCompleteWithRecord) {
      setCompletionTarget(task);
      setCompletionForm(buildCompletionPrefill(task));
      return;
    }

    const wasDone = isDone(task);
    const successMessage = wasDone && nextStatus !== 'done'
      ? 'Demanda reaberta.'
      : 'Status atualizado.';

    handleUpdateTaskFields(task, { status: nextStatus, done: nextStatus === 'done' }, successMessage);
  }

  async function handleCompleteWithRecord(event) {
    event.preventDefault();
    if (!completionTarget?.id) return;

    const body = buildCompletionRecord(completionTarget, completionForm);

    try {
      setCompletionSaving(true);
      const [taskRes, commentRes] = await Promise.allSettled([
        updateProjectTask(completionTarget.id, { done: true, status: 'done' }),
        body ? createTaskComment(completionTarget.id, { body }) : Promise.resolve(null),
      ]);

      if (taskRes.status === 'rejected') throw taskRes.reason;
      const updated = taskRes.value?.task || { ...completionTarget, done: true, status: 'done' };
      setTasks((prev) => prev.map((item) => (item.id === completionTarget.id ? { ...item, ...updated, done: true, status: 'done' } : item)));
      if (activeTaskId === completionTarget.id && commentRes.status === 'fulfilled' && commentRes.value?.comment) {
        setTaskComments((prev) => [...prev, commentRes.value.comment]);
      }
      await refreshActiveTaskPanels(completionTarget.id, { comments: true, events: true });
      setCompletionTarget(null);
      setCompletionForm({ result: '', pending: '', nextAction: '', notes: '' });
      showToast('Demanda concluída.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao concluir demanda.', { variant: 'error' });
    } finally {
      setCompletionSaving(false);
    }
  }


  async function handleCreateSubtask(event) {
    event.preventDefault();
    if (!activeTask) return;
    if (!canCreateActiveSubtask) {
      showToast('Sem permissão para criar subtarefa nesta demanda.', { variant: 'error' });
      return;
    }
    const title = subtaskDraft.trim();
    if (!title) return;

    try {
      setSubtaskSaving(true);
      const res = await createTask({
        title,
        parentTaskId: activeTask.id,
        projectId: activeTask.projectId || undefined,
        sectionId: activeTask.sectionId || undefined,
        clientId: activeTask.clientId || undefined,
        assigneeUserId: activeTask.assigneeUserId || user?.id || undefined,
        priority: activeTask.priority || 'medium',
      });
      if (res?.task) {
        setTasks((prev) => (prev.some((item) => item.id === res.task.id) ? prev : [...prev, res.task]));
        setDrawerSubtasks((prev) => (prev.some((item) => item.id === res.task.id) ? prev : [...prev, res.task]));
      }
      await refreshActiveTaskPanels(activeTask.id, { events: true, subtasks: true });
      setSubtaskDraft('');
      showToast('Subtarefa criada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao criar subtarefa.', { variant: 'error' });
    } finally {
      setSubtaskSaving(false);
    }
  }

  async function handleCreateComment(event) {
    event.preventDefault();
    if (!activeTask) return;
    if (!canCommentActiveTask) {
      showToast('Sem permissão para comentar nesta demanda.', { variant: 'error' });
      return;
    }
    const body = commentDraft.trim();
    const pendingAttachments = Array.isArray(commentAttachments) ? commentAttachments : [];
    if (!body && !pendingAttachments.length) return;

    try {
      setCommentSaving(true);

      let savedAttachments = [];
      if (pendingAttachments.length) {
        const uploaded = await Promise.allSettled(pendingAttachments.map((item) => createTaskAttachment(activeTask.id, {
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          dataUrl: item.dataUrl,
        })));
        savedAttachments = uploaded
          .filter((result) => result.status === 'fulfilled' && result.value?.attachment)
          .map((result) => result.value.attachment);
        if (savedAttachments.length) setTaskAttachments((prev) => [...savedAttachments, ...prev]);
      }

      const attachmentMarker = savedAttachments.length
        ? `${COMMENT_ATTACHMENT_MARKER}${savedAttachments.map((item) => item.id).join(',')}]]`
        : '';
      const fallbackBody = savedAttachments.length ? 'Anexo enviado' : '';
      const commentBody = [body || fallbackBody, attachmentMarker].filter(Boolean).join('\n');

      const res = await createTaskComment(activeTask.id, { body: commentBody });
      if (res?.comment) setTaskComments((prev) => [...prev, res.comment]);

      await refreshActiveTaskPanels(activeTask.id, { events: true, attachments: savedAttachments.length > 0 });
      setCommentDraft('');
      setCommentAttachments([]);
      showToast(savedAttachments.length ? 'Comentário e anexos adicionados.' : 'Comentário adicionado.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao comentar.', { variant: 'error' });
    } finally {
      setCommentSaving(false);
    }
  }

  async function handleRegisterBriefingIssues() {
    if (!activeTask || !activeBriefing || activeBriefing.isComplete) return;
    if (!canCommentActiveTask) {
      showToast('Sem permissão para registrar pendências.', { variant: 'error' });
      return;
    }

    const missing = activeBriefing.missingRequired.map((field) => field.label).join(', ');
    const body = ['Briefing incompleto.', missing ? `Pendências: ${missing}` : ''].filter(Boolean).join('\n');

    try {
      setCommentSaving(true);
      const res = await createTaskComment(activeTask.id, { body });
      if (res?.comment) setTaskComments((prev) => [...prev, res.comment]);
      await refreshActiveTaskPanels(activeTask.id, { events: true });
      showToast('Pendências registradas.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao registrar pendências.', { variant: 'error' });
    } finally {
      setCommentSaving(false);
    }
  }

  async function handleCompleteBriefingOperation() {
    if (!activeTask) return;
    if (!canCompleteActiveTask) {
      showToast('Sem permissão para concluir esta demanda.', { variant: 'error' });
      return;
    }

    const body = [
      'Operação concluída.',
      'Implementação, ativação, acessos, tráfego e validação final concluídos.',
    ].join('\n');

    try {
      setTaskUpdatingId(activeTask.id);
      const [taskRes, commentRes] = await Promise.allSettled([
        updateProjectTask(activeTask.id, { done: true, status: 'done' }),
        createTaskComment(activeTask.id, { body }),
      ]);

      if (taskRes.status === 'rejected') throw taskRes.reason;
      const updated = taskRes.value?.task || { ...activeTask, done: true, status: 'done' };
      setTasks((prev) => prev.map((item) => (item.id === activeTask.id ? { ...item, ...updated, done: true, status: 'done' } : item)));
      if (commentRes.status === 'fulfilled' && commentRes.value?.comment) {
        setTaskComments((prev) => [...prev, commentRes.value.comment]);
      }
      await refreshActiveTaskPanels(activeTask.id, { comments: true, events: true });
      showToast('Demanda concluída.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao concluir demanda.', { variant: 'error' });
    } finally {
      setTaskUpdatingId('');
    }
  }


  function openHandoff(task = activeTask, overrides = {}) {
    if (!task) return;
    if (!canEditProfileTask(user, task) || !canCommentProfileTask(user, task)) {
      showToast('Sem permissão para registrar handoff nesta demanda.', { variant: 'error' });
      return;
    }
    const nextStatus = overrides.status || (isDone(task) ? 'done' : task.status || 'in_progress');
    const nextForm = emptyHandoffForm(overrides.assigneeUserId || task.assigneeUserId || user?.id || '', nextStatus);
    nextForm.nextAction = overrides.nextAction || nextActionLabel({ ...task, status: nextStatus, done: nextStatus === 'done' });
    nextForm.pending = overrides.pending || summarizeOpenSubtasks(activeSubtasks);
    nextForm.note = overrides.note || activeDescription || '';
    setHandoffForm(nextForm);
    setHandoffOpen(true);
  }

  async function handleSubmitHandoff(event) {
    event.preventDefault();
    if (!activeTask || !handoffForm.assigneeUserId) return;
    if (!canEditActiveTask || !canCommentActiveTask) {
      showToast('Sem permissão para registrar handoff nesta demanda.', { variant: 'error' });
      return;
    }

    const nextAssignee = assigneeOptions.find((item) => item.id === handoffForm.assigneeUserId);
    const nextStatusLabel = statusOptionsForKind(activeKind).find((option) => option.value === handoffForm.status)?.label || handoffForm.status;
    const recentComments = summarizeRecentComments(visibleTaskComments);

    try {
      setHandoffSaving(true);
      const updateBody = {
        assigneeUserId: handoffForm.assigneeUserId,
        status: handoffForm.status,
        done: handoffForm.status === 'done',
        source: 'handoff',
        handoff: {
          assigneeName: nextAssignee?.name || 'Responsável',
          statusLabel: nextStatusLabel,
          kindLabel: kindLabel(activeKind),
          priorityLabel: priorityLabel(priorityKey(activeTask)),
          dueLabel: formatDueLabel(activeTask?.dueDate),
          clientName: activeTask?.clientName || '',
          projectName: activeTask?.projectName || '',
          nextAction: handoffForm.nextAction,
          pending: handoffForm.pending || summarizeOpenSubtasks(activeSubtasks),
          note: handoffForm.note,
          recentComments,
        },
      };
      const taskRes = await updateProjectTask(activeTask.id, updateBody);

      const updated = taskRes?.task || { ...activeTask, ...updateBody, assigneeName: nextAssignee?.name || activeTask.assigneeName };
      setTasks((prev) => prev.map((item) => (item.id === activeTask.id ? { ...item, ...updated } : item)));
      await refreshActiveTaskPanels(activeTask.id, { comments: true, events: true });
      setHandoffOpen(false);
      setCompletionTarget(null);
      showToast('Handoff registrado.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao registrar handoff.', { variant: 'error' });
    } finally {
      setHandoffSaving(false);
    }
  }

  async function handleDeleteComment() {
    if (!activeTask || !commentDeleteTarget?.id) return;

    try {
      setCommentDeleting(true);
      const attachmentIds = commentAttachmentIds(commentDeleteTarget);
      if (attachmentIds.length) {
        await Promise.allSettled(attachmentIds.map((attachmentId) => deleteTaskAttachment(activeTask.id, attachmentId)));
        setTaskAttachments((prev) => prev.filter((item) => !attachmentIds.includes(String(item.id))));
      }
      await deleteTaskComment(activeTask.id, commentDeleteTarget.id);
      setTaskComments((prev) => prev.filter((comment) => comment.id !== commentDeleteTarget.id));
      await refreshActiveTaskPanels(activeTask.id, { events: true, attachments: attachmentIds.length > 0 });
      setCommentDeleteTarget(null);
      setSubtaskDeleteTarget(null);
      showToast('Comentário excluído.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao excluir comentário.', { variant: 'error' });
    } finally {
      setCommentDeleting(false);
    }
  }


  async function handleAddCollaborator(event) {
    event.preventDefault();
    if (!activeTask || !collaboratorUserId) return;
    if (!canManageActiveCollaborators) {
      showToast('Sem permissão para adicionar colaborador.', { variant: 'error' });
      return;
    }

    try {
      setCollaboratorSaving(true);
      await addTaskCollaborator(activeTask.id, { userId: collaboratorUserId, role: 'follower' });
      const selectedUser = demandUsers.find((item) => item.id === collaboratorUserId);
      setCollaborators((prev) => {
        if (prev.some((item) => item.userId === collaboratorUserId)) return prev;
        return [
          ...prev,
          {
            taskId: activeTask.id,
            userId: collaboratorUserId,
            role: 'follower',
            userName: selectedUser?.name || 'Usuário',
            userEmail: selectedUser?.email || '',
            createdAt: new Date().toISOString(),
          },
        ];
      });
      setCollaboratorUserId('');
      await refreshActiveTaskPanels(activeTask.id, { events: true, collaborators: true });
      showToast('Colaborador adicionado.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao adicionar colaborador.', { variant: 'error' });
    } finally {
      setCollaboratorSaving(false);
    }
  }

  async function handleRemoveCollaborator(userId) {
    if (!activeTask || !userId) return;
    if (!canManageActiveCollaborators) {
      showToast('Sem permissão para remover colaborador.', { variant: 'error' });
      return;
    }

    try {
      setCollaboratorRemovingId(userId);
      await removeTaskCollaborator(activeTask.id, userId);
      setCollaborators((prev) => prev.filter((item) => item.userId !== userId));
      if (collaboratorUserId === userId) setCollaboratorUserId('');
      await refreshActiveTaskPanels(activeTask.id, { events: true, collaborators: true });
      showToast('Colaborador removido.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao remover colaborador.', { variant: 'error' });
    } finally {
      setCollaboratorRemovingId('');
    }
  }



  async function handleDeleteSubtask() {
    if (!subtaskDeleteTarget?.id) return;
    if (!canEditProfileTask(user, subtaskDeleteTarget)) {
      showToast('Sem permissão para excluir subtarefa.', { variant: 'error' });
      return;
    }

    try {
      setSubtaskDeleting(true);
      await deleteTask(subtaskDeleteTarget.id);
      setTasks((prev) => prev.filter((task) => task.id !== subtaskDeleteTarget.id));
      setDrawerSubtasks((prev) => prev.filter((task) => task.id !== subtaskDeleteTarget.id));
      await refreshActiveTaskPanels(activeTaskId, { events: true, subtasks: true });
      setSubtaskDeleteTarget(null);
      showToast('Subtarefa excluída.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao excluir subtarefa.', { variant: 'error' });
    } finally {
      setSubtaskDeleting(false);
    }
  }

  async function handleDeleteActiveTask() {
    if (!taskDeleteTarget?.id) return;
    if (!canEditProfileTask(user, taskDeleteTarget)) {
      showToast('Sem permissão para excluir esta demanda.', { variant: 'error' });
      return;
    }

    try {
      setTaskDeleting(true);
      await deleteTask(taskDeleteTarget.id);
      setTasks((prev) => prev.filter((task) => task.id !== taskDeleteTarget.id && task.parentTaskId !== taskDeleteTarget.id));
      closeActiveTaskDrawer();
      showToast('Demanda excluída.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao excluir demanda.', { variant: 'error' });
    } finally {
      setTaskDeleting(false);
    }
  }

  async function handleOpenDemandModal() {
    if (!canCreateDemand) {
      showToast('Sem permissão para criar demanda.', { variant: 'error' });
      return;
    }
    resetDemandModalState();
    setDemandForm((prev) => ({ ...emptyDemandForm(user?.id || ''), assigneeUserId: prev.assigneeUserId || user?.id || '' }));
    setDemandModalOpen(true);

    try {
      const [usersRes, clientsRes] = await Promise.allSettled([listUserDirectory(), listClients()]);
      if (usersRes.status === 'fulfilled') {
        const nextUsers = Array.isArray(usersRes.value?.users) ? usersRes.value.users : [];
        setDemandUsers(nextUsers);
        setDemandForm((prev) => ({ ...prev, assigneeUserId: prev.assigneeUserId || nextUsers[0]?.id || user?.id || '' }));
      }
      if (clientsRes.status === 'fulfilled') {
        setDemandClients(Array.isArray(clientsRes.value?.clients) ? clientsRes.value.clients : []);
      }
    } catch {
      // silencioso: a criação de demanda continua com dados disponíveis.
    }
  }


  async function handleDemandAttachmentFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    await addDemandAttachments(files);
    if (event.target) event.target.value = '';
  }

  async function addDemandAttachments(files) {
    const selected = uniqueFiles(files).filter(Boolean);
    if (!selected.length) return;

    try {
      const parsed = await Promise.all(selected.map(readTaskAttachmentFile));
      setDemandForm((prev) => {
        const current = Array.isArray(prev.attachments) ? prev.attachments : [];
        const seen = new Set(current.map(attachmentSignature));
        const next = parsed.filter((item) => {
          const key = attachmentSignature(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return {
          ...prev,
          attachments: [...current, ...next].slice(0, 8),
        };
      });
    } catch (err) {
      showToast(err?.message || 'Não foi possível anexar o arquivo.', { variant: 'error' });
    }
  }

  function handleDemandPaste(event) {
    if (event?.nativeEvent?.__edificaAttachmentPasteHandled) return;
    const files = filesFromClipboard(event);
    if (!files.length) return;
    event.nativeEvent.__edificaAttachmentPasteHandled = true;
    event.preventDefault();
    event.stopPropagation();
    addDemandAttachments(files);
  }

  useEffect(() => {
    if (!demandModalOpen) return undefined;

    function handleDemandGlobalPaste(event) {
      const files = filesFromClipboard(event);
      if (!files.length) return;
      event.preventDefault();
      addDemandAttachments(files);
    }

    document.addEventListener('paste', handleDemandGlobalPaste);
    return () => document.removeEventListener('paste', handleDemandGlobalPaste);
  }, [demandModalOpen]);

  async function addCommentAttachments(files) {
    const selected = uniqueFiles(files).filter(Boolean);
    if (!selected.length) return;

    try {
      const parsed = await Promise.all(selected.map(readTaskAttachmentFile));
      setCommentAttachments((prev) => {
        const seen = new Set(prev.map(attachmentSignature));
        const next = parsed.filter((item) => {
          const key = attachmentSignature(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return [...prev, ...next].slice(0, 6);
      });
    } catch (err) {
      showToast(err?.message || 'Não foi possível anexar o arquivo.', { variant: 'error' });
    }
  }

  function handleCommentPaste(event) {
    if (event?.nativeEvent?.__edificaAttachmentPasteHandled) return;
    const files = filesFromClipboard(event);
    if (!files.length) return;
    event.nativeEvent.__edificaAttachmentPasteHandled = true;
    event.preventDefault();
    event.stopPropagation();
    addCommentAttachments(files);
  }

  function handleRemoveCommentAttachment(attachmentId) {
    setCommentAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
  }

  function handleRemoveDemandAttachment(attachmentId) {
    setDemandForm((prev) => ({
      ...prev,
      attachments: (prev.attachments || []).filter((item) => item.id !== attachmentId),
    }));
  }

  async function handleDeleteTaskAttachment(attachment) {
    if (!activeTask?.id || !attachment?.id) return;
    if (!canEditActiveTask) {
      showToast('Sem permissão para remover anexo.', { variant: 'error' });
      return;
    }

    try {
      setTaskAttachmentDeletingId(attachment.id);
      await deleteTaskAttachment(activeTask.id, attachment.id);
      setTaskAttachments((prev) => prev.filter((item) => item.id !== attachment.id));
      showToast('Anexo removido.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao remover anexo.', { variant: 'error' });
    } finally {
      setTaskAttachmentDeletingId('');
    }
  }

  async function handleTaskAttachmentFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length || !activeTask?.id) return;

    if (!canEditActiveTask) {
      showToast('Sem permissão para anexar arquivo.', { variant: 'error' });
      if (event.target) event.target.value = '';
      return;
    }

    try {
      const parsed = await Promise.all(files.map(readTaskAttachmentFile));
      const uploaded = await Promise.allSettled(parsed.map((item) => createTaskAttachment(activeTask.id, {
        fileName: item.fileName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        dataUrl: item.dataUrl,
      })));
      const savedAttachments = uploaded
        .filter((result) => result.status === 'fulfilled' && result.value?.attachment)
        .map((result) => result.value.attachment);
      if (savedAttachments.length) {
        setTaskAttachments((prev) => [...savedAttachments, ...prev]);
        setTaskAttachmentsAlbumOpen(true);
      }
      showToast('Anexo adicionado.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao anexar arquivo.', { variant: 'error' });
    } finally {
      if (event.target) event.target.value = '';
    }
  }

  async function handleCreateDemand(event) {
    event.preventDefault();
    if (!canCreateDemand) {
      showToast('Sem permissão para criar demanda.', { variant: 'error' });
      return;
    }
    const missingFields = validateDemandForm(demandForm);
    if (missingFields.length) {
      showToast(`Preencha: ${joinMissingFields(missingFields)}.`, { variant: 'error' });
      return;
    }

    const title = demandForm.title.trim();
    const selectedClient = demandClients.find((client) => client.id === demandForm.clientId);
    const description = buildDemandDescription(demandForm, selectedClient?.name || '');

    try {
      setDemandSaving(true);
      const res = await createTask({
        title,
        description,
        assigneeUserId: demandForm.assigneeUserId,
        clientId: demandForm.clientId || undefined,
        dueDate: demandForm.dueDate || undefined,
        priority: demandForm.priority,
      });
      const createdTask = res?.task;
      if (createdTask?.id) {
        const collaboratorIds = [...new Set((demandForm.collaboratorUserIds || []).filter((id) => id && id !== createdTask.assigneeUserId))];
        if (collaboratorIds.length) {
          await Promise.allSettled(collaboratorIds.map((id) => addTaskCollaborator(createdTask.id, { userId: id, role: 'follower' })));
        }
        const attachments = Array.isArray(demandForm.attachments) ? demandForm.attachments : [];
        if (attachments.length) {
          const uploaded = await Promise.allSettled(attachments.map((item) => createTaskAttachment(createdTask.id, {
            fileName: item.fileName,
            mimeType: item.mimeType,
            sizeBytes: item.sizeBytes,
            dataUrl: item.dataUrl,
          })));
          const savedAttachments = uploaded
            .filter((result) => result.status === 'fulfilled' && result.value?.attachment)
            .map((result) => result.value.attachment);
          setTaskAttachments(savedAttachments);
        }
        const createdForCurrentUser = createdTask.assigneeUserId === user?.id;
        const visibleCreatedTask = {
          ...createdTask,
          profileRelation: createdForCurrentUser ? 'responsible' : (createdTask.profileRelation || 'collaborator'),
        };
        setTasks((prev) => (prev.some((item) => item.id === visibleCreatedTask.id) ? prev : [visibleCreatedTask, ...prev]));
        setActiveTaskId(visibleCreatedTask.id);
        setOperationTab(createdForCurrentUser ? 'waiting' : 'watching');
        setOperationPage(1);
      }
      closeDemandModal();
      showToast(createdTask?.assigneeUserId && createdTask.assigneeUserId !== user?.id ? 'Demanda criada e acompanhada.' : 'Demanda criada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Erro ao criar demanda.', { variant: 'error' });
    } finally {
      setDemandSaving(false);
    }
  }

  const activeKind = activeTask ? getTaskKind(activeTask) : 'demand';
  const activeStatus = activeTask ? statusKey(activeTask) : 'waiting';
  const activeStatusOptions = activeTask ? statusOptionsForKind(activeKind) : BASE_STATUS_OPTIONS;
  const activeWorkflowSteps = activeTask ? workflowStepsForTask(activeTask) : [];
  const activeAssignee = activeTask ? taskAssigneeName(activeTask, demandUsers) : '';
  const activeRequester = activeTask ? taskRequesterName(activeTask, '') : '';
  const activeNextAction = activeTask ? nextActionLabel(activeTask) : '';
  const activeCollaboratorNames = collaborators.map((item) => item.userName || item.name).filter(Boolean);
  const activeIsDone = activeTask ? isDone(activeTask) : false;
  const activeOwnerLabel = activeIsDone ? 'Responsável final' : 'Agora com';
  const activeStageLabel = activeIsDone ? 'Operação concluída' : (activeNextAction || statusLabel(activeTask));
  const activeFollowerLabel = activeCollaboratorNames.length
    ? `${activeCollaboratorNames.slice(0, 2).join(', ')}${activeCollaboratorNames.length > 2 ? ` +${activeCollaboratorNames.length - 2}` : ''}`
    : '—';
  const activeContextItems = activeTask
    ? [
        [activeOwnerLabel, activeAssignee || '—'],
        [activeIsDone ? 'Resultado' : 'Próximo passo', activeStageLabel || '—'],
        ['Tipo', kindLabel(activeKind)],
        ...(activeRequester ? [['Solicitante', activeRequester]] : []),
        ...(activeTask.clientName ? [['Cliente', activeTask.clientName]] : []),
        ['Acompanhando', activeFollowerLabel],
        ...(activeTask.projectName ? [['Projeto', activeTask.projectName]] : []),
        ...(activeTask.sectionName ? [['Seção', activeTask.sectionName]] : []),
      ]
    : [];
  const assigneeOptions = useMemo(() => {
    const map = new Map();
    [...(demandUsers || []), user].filter(Boolean).forEach((item) => {
      if (item?.id) map.set(item.id, item);
    });
    if (activeTask?.assigneeUserId && activeTask?.assigneeName && !map.has(activeTask.assigneeUserId)) {
      map.set(activeTask.assigneeUserId, { id: activeTask.assigneeUserId, name: activeTask.assigneeName });
    }
    return Array.from(map.values());
  }, [activeTask?.assigneeName, activeTask?.assigneeUserId, demandUsers, user]);

  const selectedDemandClient = useMemo(
    () => demandClients.find((client) => client.id === demandForm.clientId) || null,
    [demandClients, demandForm.clientId]
  );

  const selectedDemandCollaborators = useMemo(
    () => (demandForm.collaboratorUserIds || [])
      .map((id) => demandUsers.find((item) => item.id === id))
      .filter(Boolean),
    [demandForm.collaboratorUserIds, demandUsers]
  );

  const availableDemandCollaborators = useMemo(
    () => demandCollaboratorOptions(demandUsers.length ? demandUsers : [user].filter(Boolean), demandForm),
    [demandForm, demandUsers, user]
  );

  const filteredDemandClients = useMemo(() => {
    const query = normalizeText(clientQuery);
    const source = Array.isArray(demandClients) ? demandClients : [];
    if (!query) return source.slice(0, 8);
    return source.filter((client) => clientSearchText(client).includes(query)).slice(0, 8);
  }, [clientQuery, demandClients]);

  const activeBriefing = useMemo(
    () => (activeTask && getTaskKind(activeTask) === 'briefing' ? parseBriefingDescription(activeTask.description || '') : null),
    [activeTask]
  );
  const activeRoutine = useMemo(
    () => (activeTask && getTaskKind(activeTask) === 'routine' ? parseRoutineDescription(activeTask.description || '') : null),
    [activeTask]
  );

  const activeDescription = activeTask
    ? activeBriefing
      ? activeBriefing.extraDescription
      : activeRoutine
        ? activeRoutine.extraDescription
        : activeTask.description
    : '';
  const activeBriefingAction = activeTask ? briefingStageAction(activeTask, activeBriefing) : null;
  const displayProfileName = profileForm.name || user?.name || 'Perfil';
  const profileFirstName = displayProfileName.split(' ').filter(Boolean)[0] || displayProfileName;
  const todaySummary = operationCounts.today === 1
    ? 'Você possui 1 demanda agendada para hoje.'
    : operationCounts.today > 1
      ? `Você possui ${operationCounts.today} demandas agendadas para hoje.`
      : 'Você não possui demandas agendadas para hoje.';

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.identityRow}>
            <span className={`${styles.avatar} ${styles[`avatar_${profileForm.avatarColor || 'amber'}`]}`}>
              {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(profileForm.name || user?.name)}
            </span>

            <div className={styles.identityCopy}>
              <div className={styles.identityTitle}>
                <h1>{displayProfileName}</h1>
                <span
                  className={`${styles.roleBadge} ${roleLabel(user?.role) === 'Suporte de tecnologia (TI)' ? styles.roleBadgeBlackHole : ''}`.trim()}
                >
                  {roleLabel(user?.role)}
                </span>
              </div>
              <span className={styles.identityGreeting}>{todaySummary}</span>
              {user?.email ? (
                <div className={styles.identityMeta}>
                  <span>{user.email}</span>
                </div>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            className={styles.iconButton}
            onClick={() => {
              setSettingsTab('profile');
              setSettingsOpen(true);
            }}
            aria-label="Configurações"
            title="Configurações"
          >
            <SettingsIcon size={16} />
          </button>
        </div>

        <div className={styles.profileStatRail}>
          {profileStats.map(({ Icon, ...item }) => (
            <span key={item.label} className={`${styles.profileStat} ${styles[`profileStat_${item.tone}`] || ''}`.trim()}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <em>{item.hint}</em>
            </span>
          ))}
        </div>
      </section>

      <section className={styles.operationBoard}>
        <header className={styles.operationHeader}>
          <div className={styles.operationHeaderTop}>
            <div className={styles.operationTitleBlock}>
              <h2 className={styles.operationHeading}>
                <ChecklistIcon size={16} strokeWidth={2} aria-hidden="true" />
                <span>Minhas tarefas</span>
              </h2>
            </div>
            <button type="button" className={styles.primaryAction} onClick={handleOpenDemandModal} disabled={!canCreateDemand} title={!canCreateDemand ? 'Sem permissão para criar demanda' : undefined}>Nova demanda</button>
          </div>

          <div className={styles.operationControlPanel}>
            <nav className={styles.operationTabs} aria-label="Operação">
              {OPERATION_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={`${styles.operationTab} ${operationTab === tab.value ? styles.operationTabActive : ''}`.trim()}
                  onClick={() => { setOperationTab(tab.value); setOperationPage(1); }}
                  aria-current={operationTab === tab.value ? 'page' : undefined}
                >
                  <span className={styles.operationTabLabel}>{tab.label}</span>
                  <span className={styles.operationTabCount}>{operationCounts[tab.value] || 0}</span>
                </button>
              ))}
            </nav>
          </div>
        </header>

        <div className={styles.operationBody}>
          {tasksLoading ? (
            <div className={styles.operationLoading} aria-label="Carregando tarefas">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className={styles.operationLoadingRow}>
                  <span />
                  <div>
                    <i />
                    <b />
                  </div>
                  <em />
                  <em />
                  <strong />
                </div>
              ))}
            </div>
          ) : tasksError ? (
            <StateBlock variant="error" compact title="Erro" />
          ) : visibleTasks.length === 0 ? (
            <div className={styles.emptyOperation}>
              <span>{emptyOperationLabel(operationTab)}</span>
            </div>
          ) : (
            <>
              <div className={styles.operationList}>
                <div className={styles.operationListHeader} aria-hidden="true">
                  <span />
                  <span>Tarefa</span>
                  <span>Propriedades</span>
                  <span>Etapa</span>
                  <span>Colab.</span>
                  <span>Prazo</span>
                </div>
                {visibleTasks.map((task) => {
                  const itemKind = getTaskKind(task);
                  const itemStatus = statusKey(task);
                  const stageProgress = taskStageProgress(task);
                  const taskPeople = buildTaskPeople(
                    { ...task, collaborators: taskPeopleMap[task.id] || task.collaborators || task.people || [] },
                    demandUsers
                  );
                  const clientName = extractTaskClientName(task);
                  const projectOrigin = isProjectOriginTask(task);
                  const projectName = taskProjectName(task);
                  return (
                    <article
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      className={`${styles.operationRow} ${isDone(task) ? styles.operationRowDone : ''}`.trim()}
                      onClick={() => setActiveTaskId(task.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setActiveTaskId(task.id);
                        }
                      }}
                    >
                      <button
                        type="button"
                        className={`${styles.statusCheck} ${isDone(task) ? styles.statusCheckDone : ''}`.trim()}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToggleTask(task);
                        }}
                        disabled={taskUpdatingId === task.id}
                        aria-label={isDone(task) ? 'Reabrir' : 'Concluir'}
                      >
                        {isDone(task) ? '✓' : ''}
                      </button>

                      <div className={styles.operationMain}>
                        <strong>{displayTaskTitle(task)}</strong>
                        {(clientName || projectOrigin) ? (
                          <span className={styles.operationSubline}>
                            {clientName ? <em>{clientName}</em> : null}
                            {projectOrigin ? <i>{projectName ? `Projeto · ${projectName}` : 'Direto do projeto'}</i> : null}
                          </span>
                        ) : null}
                      </div>

                      <div className={styles.operationMeta}>
                        {visibleOperationTags(task).slice(0, 1).map((tag) => (
                          <span
                            key={tag.key}
                            className={`${styles[tag.className] || ''} ${styles[tag.tone] || ''}`.trim()}
                          >
                            {tag.label}
                          </span>
                        ))}
                      </div>

                      <div className={styles.operationStageCell}>
                        <span
                          className={`${styles.stageProgressPill} ${styles[`stage_${stageProgress.tone}`] || ''}`.trim()}
                          style={{ '--stage-progress': `${stageProgress.progress}%` }}
                        >
                          <span className={styles.stageProgressTrack} aria-hidden="true" />
                          <span className={styles.stageProgressLabel}>{stageProgress.label}</span>
                          <span className={styles.stageProgressValue}>{stageProgress.progress}%</span>
                        </span>
                      </div>

                      <div className={styles.operationPeopleCell}>
                        {taskPeople.length ? (
                          <span className={styles.taskAvatarStack} aria-label={`Colaboradores: ${taskPeopleLabel(taskPeople)}`} title={taskPeopleLabel(taskPeople)}>
                            {taskPeople.slice(0, 4).map((person) => {
                              const avatar = getUserAvatar(person);
                              return (
                                <span
                                  key={person.userId || person.userName}
                                  className={`${styles.taskAvatar} ${styles[`taskAvatar_${avatarColorClassName(person.avatarColor)}`] || ''}`.trim()}
                                >
                                  {avatar ? <img src={avatar} alt="" /> : initials(person.userName)}
                                </span>
                              );
                            })}
                            {taskPeople.length > 4 ? <span className={`${styles.taskAvatar} ${styles.taskAvatarMore}`}>+{taskPeople.length - 4}</span> : null}
                          </span>
                        ) : (
                          <span className={styles.taskAvatarEmpty}>—</span>
                        )}
                      </div>

                      <div className={styles.operationDueCell}>
                        <span className={`${styles.dueLabel} ${styles[`due_${itemStatus}`] || ''}`.trim()}>{formatDueLabel(task.dueDate)}</span>
                      </div>
                    </article>
                  );
                })}
              </div>

              {tabTasks.length > OPERATION_PAGE_SIZE ? (
                <div className={styles.operationPagination} aria-label="Paginação da operação">
                  <span>{operationRangeStart}-{operationRangeEnd} de {tabTasks.length}</span>
                  <span className={styles.operationPageIndicator}>Página {safeOperationPage} de {operationTotalPages}</span>
                  <div>
                    <button type="button" onClick={() => setOperationPage((page) => Math.max(1, page - 1))} disabled={safeOperationPage <= 1}>Anterior</button>
                    <button type="button" onClick={() => setOperationPage((page) => Math.min(operationTotalPages, page + 1))} disabled={safeOperationPage >= operationTotalPages}>Próxima</button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      {activeTask ? (
        <aside className={styles.drawerOverlay} aria-label="Demanda" onClick={closeActiveTaskDrawer}>
          <section className={styles.drawerPanel} onClick={(event) => event.stopPropagation()}>
            <header className={styles.drawerTopbar}>
              <div className={styles.drawerStatusGroup}>
                <button
                  type="button"
                  className={`${styles.statusCheck} ${isDone(activeTask) ? styles.statusCheckDone : ''}`.trim()}
                  onClick={() => handleToggleTask(activeTask)}
                  disabled={taskUpdatingId === activeTask.id || !canCompleteActiveTask}
                  aria-label={isDone(activeTask) ? 'Reabrir' : 'Concluir'}
                >
                  {isDone(activeTask) ? '✓' : ''}
                </button>
                <span className={`${styles.statusBadge} ${styles[`status_${activeStatus}`] || ''}`.trim()}>{statusLabel(activeTask)}</span>
              </div>
              <div className={styles.drawerTopbarActions}>
                {contentEditing ? (
                  <>
                    <button type="button" className={styles.drawerTopbarButton} onClick={() => setContentEditing(false)} disabled={contentSaving}>Cancelar</button>
                    <button type="button" className={`${styles.drawerTopbarButton} ${styles.drawerTopbarPrimary}`} onClick={handleSaveContent} disabled={contentSaving || !canEditActiveTask}>
                      {contentSaving ? 'Salvando' : 'Salvar'}
                    </button>
                  </>
                ) : (
                  <button type="button" className={styles.drawerTopbarButton} onClick={() => openContentEditor(activeTask)} disabled={!canEditActiveTask}>Editar</button>
                )}
                <button type="button" className={styles.drawerTopbarDanger} onClick={() => setTaskDeleteTarget(activeTask)} disabled={!canEditActiveTask} aria-label="Excluir tarefa" title="Excluir tarefa">
                  <TrashIcon size={15} />
                </button>
                <button type="button" className={styles.iconButton} onClick={closeActiveTaskDrawer} aria-label="Fechar">
                  <CloseIcon size={16} />
                </button>
              </div>
            </header>

            <div className={styles.drawerScroll}>
              <div className={styles.drawerHero}>
                {contentEditing ? (
                  <input
                    className={styles.titleEditor}
                    value={contentForm.title}
                    onChange={(event) => setContentForm((prev) => ({ ...prev, title: event.target.value }))}
                    aria-label="Título"
                  />
                ) : (
                  <>
                    <h3>{activeTask.title}</h3>
                    {(extractTaskClientName(activeTask) || isProjectOriginTask(activeTask)) ? (
                      <div className={styles.drawerHeroMeta}>
                        {extractTaskClientName(activeTask) ? <span>{extractTaskClientName(activeTask)}</span> : null}
                        {isProjectOriginTask(activeTask) ? <em>{taskProjectName(activeTask) ? `Projeto · ${taskProjectName(activeTask)}` : 'Direto do projeto'}</em> : null}
                      </div>
                    ) : null}
                  </>
                )}
                <div className={styles.drawerHeroActions}>
                  <div className={styles.drawerHeroActionGroup}>
                    {activeKind === 'briefing' && activeBriefingAction?.type === 'issues' ? (
                      <button type="button" onClick={handleRegisterBriefingIssues} disabled={commentSaving || !canCommentActiveTask}>Pendências</button>
                    ) : null}
                    {activeKind === 'briefing' && activeBriefingAction?.type === 'complete' ? (
                      <button type="button" className={styles.heroActionPrimary} onClick={handleCompleteBriefingOperation} disabled={taskUpdatingId === activeTask.id || !canCompleteActiveTask}>Concluir tarefa</button>
                    ) : null}
                    {activeKind === 'briefing' && activeBriefingAction?.type === 'handoff' ? (
                      <button
                        type="button"
                        className={styles.heroActionPrimary}
                        onClick={() => openHandoff(activeTask, { status: activeBriefingAction.status, nextAction: activeBriefingAction.nextAction })}
                        disabled={!canEditActiveTask || !canCommentActiveTask}
                      >
                        {activeBriefingAction.label}
                      </button>
                    ) : null}
                    {activeKind !== 'briefing' ? (
                      <button type="button" onClick={() => openHandoff(activeTask)} disabled={!canEditActiveTask || !canCommentActiveTask}>Passar etapa</button>
                    ) : null}
                  </div>
                </div>
              </div>

              <section className={styles.drawerSection}>
                <div className={styles.workflowGrid}>
                  <div className={styles.workflowField}>
                    <span>Status</span>
                    <Select
                      value={activeTask.status || (isDone(activeTask) ? 'done' : 'todo')}
                      onChange={(event) => handleChangeTaskStatus(activeTask, event.target.value)}
                      aria-label="Status"
                      className={styles.workflowSelect}
                      disabled={!canEditActiveTask}
                    >
                      {activeStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>
                  </div>

                  <div className={styles.workflowField}>
                    <span>Responsável</span>
                    <Select
                      type="user"
                      value={activeTask.assigneeUserId || ''}
                      onChange={(event) => handleUpdateTaskFields(activeTask, { assigneeUserId: event.target.value }, 'Responsável atualizado.')}
                      aria-label="Responsável"
                      className={styles.workflowSelect}
                      disabled={!canEditActiveTask}
                    >
                      <option value="">Sem responsável</option>
                      {assigneeOptions.map((item) => <option key={item.id} value={item.id} data-avatar={getUserAvatar(item) || item.avatarUrl || ''} data-name={item.name}>{item.name}</option>)}
                    </Select>
                  </div>

                  <div className={styles.workflowField}>
                    <span>Prioridade</span>
                    <Select
                      value={activeTask.priority || 'medium'}
                      onChange={(event) => handleUpdateTaskFields(activeTask, { priority: event.target.value }, 'Prioridade atualizada.')}
                      aria-label="Prioridade"
                      className={styles.workflowSelect}
                      disabled={!canEditActiveTask}
                    >
                      {DEMAND_PRIORITIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>
                  </div>

                  <div className={styles.workflowField}>
                    <span>Prazo</span>
                    <DateField
                      value={activeTask.dueDate || ''}
                      onChange={(value) => handleUpdateTaskFields(activeTask, { dueDate: value || '' }, 'Prazo atualizado.')}
                      placeholder="Prazo"
                      ariaLabel="Prazo"
                      className={styles.workflowDate}
                      disabled={!canEditActiveTask}
                    />
                  </div>
                </div>

                {activeContextItems.length ? (
                  <div className={styles.contextGrid}>
                    {activeContextItems.map(([label, value]) => (
                      <div key={label} className={styles.contextItem}>
                        <span>{label}</span>
                        <strong>{value || '—'}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>

              {activeWorkflowSteps.length ? (
                <section className={styles.drawerSection}>
                  <div className={styles.sectionTitleRow}>
                    <h4>Fluxo</h4>
                    <span>{kindLabel(activeKind)}</span>
                  </div>
                  <div className={styles.workflowTimeline}>
                    {activeWorkflowSteps.map((step, index) => (
                      <div key={step.key} className={`${styles.workflowStep} ${styles[`workflowStep_${step.state}`] || ''} ${styles[`workflowKey_${step.key}`] || ''}`.trim()}>
                        <i>{index + 1}</i>
                        <span>{step.label}</span>
                        {step.state === 'current' ? <em>{activeAssignee || 'Responsável'}</em> : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {activeBriefing ? (
                <section className={styles.drawerSection}>
                  <div className={styles.sectionTitleRow}>
                    <h4>Briefing</h4>
                    <span className={activeBriefing.isComplete ? styles.briefingComplete : styles.briefingIncomplete}>
                      {activeBriefing.isComplete ? 'Completo' : 'Incompleto'}
                    </span>
                  </div>
                  <div className={styles.briefingSummary}>
                    <i><b style={{ width: `${activeBriefing.completion}%` }} /></i>
                    <span>{activeBriefing.filledRequired}/{activeBriefing.requiredTotal}</span>
                  </div>
                  {!activeBriefing.isComplete ? (
                    <div className={styles.briefingMissing}>
                      <span>Pendências</span>
                      <div>
                        {activeBriefing.missingRequired.map((field) => (
                          <em key={field.key}>{field.label}</em>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {false ? (
                    <div className={styles.structuredEditGrid}>
                      {BRIEFING_FIELDS.map((field) => (
                        <label key={field.key} className={field.key === 'notes' ? styles.fieldFull : ''}>
                          <span>{field.label}</span>
                          <input
                            value={contentForm[field.key] || ''}
                            onChange={(event) => setContentForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                          />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.briefingDetailsGrid}>
                      {BRIEFING_FIELDS.map((field) => {
                        const value = activeBriefing.values[field.key];
                        return value ? (
                          <div key={field.key} className={styles.briefingDetailItem}>
                            <span>{field.label}</span>
                            <strong>{value}</strong>
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                </section>
              ) : null}

              {activeRoutine ? (
                <section className={styles.drawerSection}>
                  <div className={styles.sectionTitleRow}>
                    <h4>Rotina</h4>
                    <span>{activeRoutine.values.recurrence || 'Recorrente'}</span>
                  </div>
                  {false ? (
                    <div className={styles.structuredEditGrid}>
                      <label>
                        <span>Recorrência</span>
                        <Select
                          value={contentForm.recurrence}
                          onChange={(event) => setContentForm((prev) => ({ ...prev, recurrence: event.target.value }))}
                          aria-label="Recorrência"
                          className={styles.formSelect}
                        >
                          {ROUTINE_RECURRENCES.map((option) => <option key={option.value} value={option.label}>{option.label}</option>)}
                        </Select>
                      </label>
                      <label>
                        <span>Escopo</span>
                        <input value={contentForm.routineScope} onChange={(event) => setContentForm((prev) => ({ ...prev, routineScope: event.target.value }))} />
                      </label>
                      <label className={styles.fieldFull}>
                        <span>Checklist</span>
                        <textarea value={contentForm.routineChecklist} onChange={(event) => setContentForm((prev) => ({ ...prev, routineChecklist: event.target.value }))} />
                      </label>
                    </div>
                  ) : (
                    <div className={styles.routineDetailsGrid}>
                      {ROUTINE_FIELDS.map((field) => {
                        const value = activeRoutine.values[field.key];
                        return value ? (
                          <div key={field.key} className={field.key === 'checklist' ? styles.routineChecklistItem : styles.briefingDetailItem}>
                            <span>{field.label}</span>
                            <strong>{value}</strong>
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                </section>
              ) : null}

              {(activeDescription || canEditActiveTask) ? (
                <section className={`${styles.drawerSection} ${styles.descriptionSection}`.trim()}>
                  <div className={styles.sectionTitleRow}>
                    <h4>Descrição</h4>
                    {activeDescription ? (
                      <button
                        type="button"
                        className={styles.sectionTinyButton}
                        onClick={() => setDescriptionExpanded((value) => !value)}
                      >
                        {descriptionExpanded ? 'Minimizar' : 'Maximizar'}
                      </button>
                    ) : null}
                  </div>
                  {descriptionEditing ? (
                    <textarea
                      className={`${styles.descriptionBox} ${styles.descriptionEditBox}`.trim()}
                      value={descriptionDraft}
                      onChange={(event) => setDescriptionDraft(event.target.value)}
                      onBlur={saveDescriptionDraft}
                      autoFocus
                    />
                  ) : (
                    <pre
                      className={`${styles.descriptionBox} ${descriptionExpanded ? styles.descriptionBoxExpanded : styles.descriptionBoxCollapsed}`.trim()}
                      onDoubleClick={openDescriptionEditor}
                    >
                      {activeDescription || ''}
                    </pre>
                  )}
                </section>
              ) : null}

              {(taskAttachmentsLoading || taskAttachments.length) ? (
                <section className={`${styles.drawerSection} ${styles.attachmentsSection}`.trim()}>
                  <div className={styles.sectionTitleRow}>
                    <h4>Anexos</h4>
                    <div className={styles.sectionTitleActions}>
                      <span>{taskAttachments.length}</span>
                      {canEditActiveTask ? (
                        <>
                          <input
                            ref={taskAttachmentInputRef}
                            type="file"
                            accept="image/*,application/pdf"
                            multiple
                            onChange={handleTaskAttachmentFiles}
                            hidden
                          />
                          <button
                            type="button"
                            className={styles.attachIconButton}
                            onClick={() => taskAttachmentInputRef.current?.click()}
                            aria-label="Adicionar anexo"
                            title="Adicionar anexo"
                          >
                            +
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {taskAttachmentsLoading ? (
                    <div className={styles.attachmentLoadingGrid} aria-label="Carregando anexos">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <span key={index} />
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className={styles.attachmentGrid}>
                        {taskAttachments.slice(0, 4).map((item) => (
                          <figure key={item.id} className={styles.attachmentCard}>
                            <button
                              type="button"
                              className={styles.attachmentPreviewButton}
                              onClick={() => setTaskAttachmentPreview(item)}
                              title={item.fileName || 'Visualizar anexo'}
                              aria-label={`Visualizar ${item.fileName || 'anexo'}`}
                            >
                              {item.mimeType === 'application/pdf' ? (
                                <span className={styles.attachmentPdfPreview}>PDF</span>
                              ) : (
                                <img src={item.dataUrl} alt={item.fileName || 'Anexo'} loading="lazy" decoding="async" />
                              )}
                            </button>
                            <figcaption>
                              <span>{item.fileName || taskAttachmentKind(item)}</span>
                              {canEditActiveTask ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setTaskAttachmentDeleteTarget(item);
                                  }}
                                  disabled={taskAttachmentDeletingId === item.id}
                                  aria-label={`Remover ${item.fileName || 'anexo'}`}
                                >
                                  ×
                                </button>
                              ) : null}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                      {taskAttachments.length > 4 ? (
                        <button type="button" className={styles.attachmentsMoreButton} onClick={() => setTaskAttachmentsAlbumOpen(true)}>
                          Ver mais
                        </button>
                      ) : null}
                    </>
                  )}
                </section>
              ) : null}

              <section className={styles.drawerSection}>
                <div className={styles.sectionTitleRow}>
                  <h4>Colaboradores</h4>
                  <span>{collaborators.length}</span>
                </div>
                <form className={styles.collaboratorComposer} onSubmit={handleAddCollaborator}>
                  <Select
                    type="user"
                    value={collaboratorUserId}
                    onChange={(event) => setCollaboratorUserId(event.target.value)}
                    aria-label="Colaborador"
                    className={styles.formSelect}
                    disabled={!canManageActiveCollaborators}
                  >
                    <option value="">Adicionar colaborador</option>
                    {collaboratorOptions.map((option) => (
                      <option key={option.id} value={option.id} data-avatar={getUserAvatar(option) || option.avatarUrl || ''} data-name={option.name}>{option.name}</option>
                    ))}
                  </Select>
                  <button type="submit" disabled={collaboratorSaving || !collaboratorUserId || !canManageActiveCollaborators}>+</button>
                </form>
                {collaboratorsLoading ? (
                  <div className={styles.compactLoadingState} aria-label="Carregando">
                    <span />
                    <span />
                    <span />
                  </div>
                ) : collaborators.length ? (
                  <div className={styles.collaboratorChips}>
                    {collaborators.map((collaborator) => {
                      const collaboratorName = collaborator.userName || collaborator.name || 'Usuário';
                      return (
                        <span key={collaborator.userId}>
                          {collaboratorName}
                          <button
                            type="button"
                            onClick={() => handleRemoveCollaborator(collaborator.userId)}
                            disabled={collaboratorRemovingId === collaborator.userId || !canManageActiveCollaborators}
                            aria-label={`Remover ${collaboratorName}`}
                            title="Remover colaborador"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : null}
              </section>

              <section className={styles.drawerSection}>
                <div className={styles.sectionTitleRow}>
                  <h4>Subtarefas</h4>
                  <span>{activeSubtasks.length}</span>
                </div>
                <form className={styles.inlineComposer} onSubmit={handleCreateSubtask}>
                  <input value={subtaskDraft} onChange={(event) => setSubtaskDraft(event.target.value)} placeholder="Subtarefa" disabled={!canCreateActiveSubtask} />
                  <button type="submit" disabled={subtaskSaving || !subtaskDraft.trim() || !canCreateActiveSubtask}>+</button>
                </form>
                {subtasksLoading ? (
                  <div className={styles.compactLoadingState} aria-label="Carregando">
                    <span />
                    <span />
                    <span />
                  </div>
                ) : activeSubtasks.length ? (
                  <div className={styles.subtaskList}>
                    {activeSubtasks.map((subtask) => (
                      <div key={subtask.id} className={styles.subtaskItem}>
                        <button
                          type="button"
                          className={`${styles.statusCheck} ${isDone(subtask) ? styles.statusCheckDone : ''}`.trim()}
                          onClick={() => handleToggleTask(subtask)}
                          disabled={taskUpdatingId === subtask.id || !canCompleteProfileTask(user, subtask)}
                          aria-label={isDone(subtask) ? 'Reabrir' : 'Concluir'}
                        >
                          {isDone(subtask) ? '✓' : ''}
                        </button>
                        <span>{subtask.title}</span>
                        <button
                          type="button"
                          className={styles.subtaskDeleteButton}
                          onClick={() => setSubtaskDeleteTarget(subtask)}
                          disabled={taskUpdatingId === subtask.id || !canEditProfileTask(user, subtask)}
                          aria-label="Excluir subtarefa"
                          title="Excluir subtarefa"
                        >
                          <TrashIcon size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className={styles.drawerSection}>
                <div className={styles.sectionTitleRow}>
                  <h4>Comentários</h4>
                  <span>{visibleTaskComments.length}</span>
                </div>
                <form className={styles.commentForm} onSubmit={handleCreateComment}>
                  <textarea
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    onPaste={handleCommentPaste}
                    placeholder="Comentário"
                    disabled={!canCommentActiveTask}
                    className={styles.commentDraftTextarea}
                  />
                  <button type="submit" disabled={commentSaving || (!commentDraft.trim() && !commentAttachments.length) || !canCommentActiveTask}>{commentSaving ? 'Enviando' : 'Comentar'}</button>
                </form>
                {commentAttachments.length ? (
                  <div className={styles.commentAttachmentDrafts}>
                    {commentAttachments.map((item) => (
                      <span key={item.id}>
                        <strong>{taskAttachmentKind(item)}</strong>
                        <em>{item.fileName}</em>
                        <button type="button" onClick={() => handleRemoveCommentAttachment(item.id)} aria-label={`Remover ${item.fileName}`}>×</button>
                      </span>
                    ))}
                  </div>
                ) : null}
                {commentsLoading ? (
                  <div className={styles.compactLoadingState} aria-label="Carregando">
                    <span />
                    <span />
                    <span />
                  </div>
                ) : visibleTaskComments.length ? (
                  <div className={styles.commentList}>
                    {visibleTaskComments.map((comment) => {
                      const commentAuthor = comment.authorName || comment.userName || 'Usuário';
                      const avatarUrl = commentAvatarUrl(comment, demandUsers, user);
                      const avatarColor = commentAvatarColor(comment, demandUsers, user);
                      return (
                        <article key={comment.id} className={styles.commentItem}>
                          <span
                            className={`${styles.commentAvatar} ${styles[`avatar_${avatarColor}`] || styles.avatar_amber} ${avatarUrl ? styles.commentAvatarPhoto : ''}`.trim()}
                            aria-hidden="true"
                          >
                            {avatarUrl ? <img src={avatarUrl} alt="" loading="lazy" decoding="async" /> : initials(commentAuthor)}
                          </span>
                          <div className={styles.commentBody}>
                            <header className={styles.commentHeader}>
                              <strong>{commentAuthor}</strong>
                              <span>{formatDateTime(comment.createdAt)}</span>
                              <button
                                type="button"
                                className={styles.commentDeleteButton}
                                onClick={() => setCommentDeleteTarget(comment)}
                                disabled={!canDeleteProfileComment(user, comment)}
                                aria-label="Excluir comentário"
                                title="Excluir comentário"
                              >
                                <TrashIcon size={13} />
                              </button>
                            </header>
                            {editingCommentId === comment.id ? (
                              <textarea
                                className={styles.commentEditTextarea}
                                value={editingCommentDraft}
                                onChange={(event) => setEditingCommentDraft(event.target.value)}
                                onBlur={() => saveCommentEditor(comment)}
                                disabled={commentEditSavingId === comment.id}
                                autoFocus
                              />
                            ) : commentDisplayBody(comment) ? (
                              <p onDoubleClick={() => openCommentEditor(comment)}>{commentDisplayBody(comment)}</p>
                            ) : null}
                            {commentAttachmentItems(comment, taskAttachments).length ? (
                              <div className={styles.commentAttachmentList}>
                                {commentAttachmentItems(comment, taskAttachments).map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setTaskAttachmentPreview(item)}
                                    className={styles.commentAttachmentItem}
                                    title={item.fileName || 'Anexo'}
                                  >
                                    {item.mimeType === 'application/pdf' ? (
                                      <span>PDF</span>
                                    ) : (
                                      <img src={item.dataUrl} alt="" loading="lazy" decoding="async" />
                                    )}
                                    <em>{item.fileName || taskAttachmentKind(item)}</em>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </section>

              <section className={styles.drawerSection}>
                <div className={styles.sectionTitleRow}>
                  <h4>Atividade</h4>
                  <span>{activeActivityEvents.length}</span>
                </div>
                <div className={styles.activityList}>
                  {visibleActivityEvents.map((event) => (
                    <div key={event.id} className={`${styles.activityItem} ${event.quiet ? styles.activityItemQuiet : ''}`.trim()}>
                      <span className={`${styles.activityMark} ${styles[`activityMark_${event.type}`] || ''}`.trim()} aria-hidden="true" />
                      <div className={styles.activityContent}>
                        <p>
                          <strong>{event.title}</strong>
                          {event.meta && !looksLikeTechnicalId(event.meta) ? <em>{event.meta}</em> : null}
                        </p>
                        {event.note && !looksLikeTechnicalId(event.note) ? <small>{event.note}</small> : null}
                        {event.createdAt ? <time>{formatDateTime(event.createdAt)}</time> : null}
                      </div>
                    </div>
                  ))}
                </div>
                {activeActivityEvents.length > ACTIVITY_PAGE_SIZE ? (
                  <div className={styles.activityPagination}>
                    <span>{safeActivityPage} / {activityTotalPages}</span>
                    <button type="button" onClick={() => setActivityPage((page) => Math.max(1, page - 1))} disabled={safeActivityPage <= 1}>Anterior</button>
                    <button type="button" onClick={() => setActivityPage((page) => Math.min(activityTotalPages, page + 1))} disabled={safeActivityPage >= activityTotalPages}>Próxima</button>
                  </div>
                ) : null}
              </section>
            </div>
            {taskAttachmentsAlbumOpen ? createPortal(
              <div
                className={styles.attachmentViewerOverlay}
                role="dialog"
                aria-modal="true"
                aria-label="Todos os anexos"
                onClick={() => setTaskAttachmentsAlbumOpen(false)}
              >
                <div className={`${styles.attachmentViewer} ${styles.attachmentAlbumViewer}`} onClick={(event) => event.stopPropagation()}>
                  <header>
                    <strong>Anexos</strong>
                    <div>
                      <button type="button" onClick={() => setTaskAttachmentsAlbumOpen(false)} aria-label="Fechar anexos">
                        <CloseIcon size={16} />
                      </button>
                    </div>
                  </header>
                  <div className={styles.attachmentAlbumGrid}>
                    {taskAttachments.map((item) => (
                      <figure key={item.id} className={styles.attachmentCard}>
                        <button
                          type="button"
                          className={styles.attachmentPreviewButton}
                          onClick={() => setTaskAttachmentPreview(item)}
                          title={item.fileName || 'Visualizar anexo'}
                        >
                          {item.mimeType === 'application/pdf' ? (
                            <span className={styles.attachmentPdfPreview}>PDF</span>
                          ) : (
                            <img src={item.dataUrl} alt={item.fileName || 'Anexo'} loading="lazy" decoding="async" />
                          )}
                        </button>
                        <figcaption>
                          <span>{item.fileName || taskAttachmentKind(item)}</span>
                          {canEditActiveTask ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setTaskAttachmentDeleteTarget(item);
                              }}
                              disabled={taskAttachmentDeletingId === item.id}
                              aria-label={`Remover ${item.fileName || 'anexo'}`}
                            >
                              ×
                            </button>
                          ) : null}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              </div>,
              document.body
            ) : null}

            {taskAttachmentPreview ? createPortal(
              <div
                className={styles.attachmentViewerOverlay}
                role="dialog"
                aria-modal="true"
                aria-label={taskAttachmentPreview.fileName || 'Anexo'}
                onClick={() => setTaskAttachmentPreview(null)}
              >
                <div className={styles.attachmentViewer} onClick={(event) => event.stopPropagation()}>
                  <header>
                    <strong>{taskAttachmentPreview.fileName || 'Anexo'}</strong>
                    <div>
                      <a href={taskAttachmentPreview.dataUrl} download={taskAttachmentPreview.fileName || 'anexo'}>Baixar</a>
                      {canEditActiveTask ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setTaskAttachmentDeleteTarget(taskAttachmentPreview);
                          }}
                          aria-label="Excluir anexo"
                          title="Excluir anexo"
                        >
                          <TrashIcon size={15} />
                        </button>
                      ) : null}
                      <button type="button" onClick={() => setTaskAttachmentPreview(null)} aria-label="Fechar visualização">
                        <CloseIcon size={16} />
                      </button>
                    </div>
                  </header>
                  <div
                    className={styles.attachmentViewerImage}
                    onWheel={(event) => {
                      if (taskAttachmentPreview.mimeType === 'application/pdf') return;
                      event.preventDefault();
                      event.stopPropagation();

                      const direction = event.deltaY > 0 ? -0.16 : 0.16;
                      const nextZoom = Math.min(4, Math.max(1, Number((taskAttachmentZoom + direction).toFixed(2))));

                      if (nextZoom <= 1) {
                        setTaskAttachmentZoom(1);
                        setTaskAttachmentZoomOrigin('50% 50%');
                        return;
                      }

                      const rect = event.currentTarget.getBoundingClientRect();
                      const originX = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
                      const originY = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
                      setTaskAttachmentZoomOrigin(`${originX.toFixed(2)}% ${originY.toFixed(2)}%`);
                      setTaskAttachmentZoom(nextZoom);
                    }}
                  >
                    {taskAttachmentPreview.mimeType === 'application/pdf' ? (
                      <iframe title={taskAttachmentPreview.fileName || 'PDF'} src={taskPdfBlobUrl || taskAttachmentPreview.dataUrl} />
                    ) : (
                      <img
                        src={taskAttachmentPreview.dataUrl}
                        alt={taskAttachmentPreview.fileName || 'Imagem anexada'}
                        decoding="async"
                        style={{
                          '--attachment-zoom-transform': `scale(${taskAttachmentZoom})`,
                          '--attachment-zoom-origin': taskAttachmentZoomOrigin,
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>,
              document.body
            ) : null}
          </section>
        </aside>
      ) : null}


      {taskAttachmentDeleteTarget ? createPortal(
        <div className={styles.taskAttachmentConfirmOverlay} role="presentation" onClick={() => setTaskAttachmentDeleteTarget(null)}>
          <section
            className={styles.taskAttachmentConfirmModal}
            role="dialog"
            aria-modal="true"
            aria-label="Remover anexo"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.taskAttachmentConfirmHead}>
              <span>Remover anexo</span>
              <strong>{taskAttachmentDeleteTarget.fileName || 'Anexo'}</strong>
            </div>
            <p>Este arquivo será removido da demanda.</p>
            <div className={styles.taskAttachmentConfirmActions}>
              <button type="button" onClick={() => setTaskAttachmentDeleteTarget(null)}>Cancelar</button>
              <button
                type="button"
                className={styles.taskAttachmentConfirmDanger}
                disabled={taskAttachmentDeletingId === taskAttachmentDeleteTarget.id}
                onClick={async () => {
                  await handleDeleteTaskAttachment(taskAttachmentDeleteTarget);
                  setTaskAttachmentDeleteTarget(null);
                  if (taskAttachmentPreview?.id === taskAttachmentDeleteTarget.id) setTaskAttachmentPreview(null);
                }}
              >
                {taskAttachmentDeletingId === taskAttachmentDeleteTarget.id ? 'Removendo' : 'Remover'}
              </button>
            </div>
          </section>
        </div>,
        document.body
      ) : null}


      {demandModalOpen ? (
        <div
          className={styles.settingsOverlay}
          onClick={(event) => event.stopPropagation()}
        >
          <form className={`${styles.settingsModal} ${styles.demandModal} ${styles[`demandModal_${demandForm.type}`] || ''}`.trim()} onSubmit={handleCreateDemand} onPaste={handleDemandPaste} role="dialog" aria-modal="true" aria-label="Nova demanda" onClick={(event) => event.stopPropagation()}>
            <header className={styles.settingsHeader}>
              <div>
                <h2>Nova demanda</h2>
                <span>{demandTypeLabel(demandForm.type)}</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={closeDemandModal} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>

            <div className={styles.settingsContent}>
              <div className={styles.demandFormGrid}>
                <label className={`${styles.labeledField} ${styles.fieldCompact}`}>
                  <span>Tipo</span>
                  <Select value={demandForm.type} onChange={(event) => setDemandForm((prev) => ({ ...prev, type: event.target.value }))} aria-label="Tipo" className={styles.formSelect}>
                    {DEMAND_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </label>
                <label className={`${styles.labeledField} ${styles.fieldCompact}`}>
                  <span>Prioridade</span>
                  <Select value={demandForm.priority} onChange={(event) => setDemandForm((prev) => ({ ...prev, priority: event.target.value }))} aria-label="Prioridade" className={styles.formSelect}>
                    {DEMAND_PRIORITIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </label>
                <label className={`${styles.labeledField} ${styles.fieldWide}`}>
                  <span>Título</span>
                  <input value={demandForm.title} onChange={(event) => setDemandForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Título" />
                </label>
                <label className={styles.labeledField}>
                  <span>Responsável</span>
                  <Select
                    type="user"
                    value={demandForm.assigneeUserId}
                    onChange={(event) => setDemandForm((prev) => ({
                      ...prev,
                      assigneeUserId: event.target.value,
                      collaboratorUserIds: (prev.collaboratorUserIds || []).filter((id) => id !== event.target.value),
                    }))}
                    aria-label="Responsável"
                    className={styles.formSelect}
                  >
                    {(demandUsers.length ? demandUsers : [user]).filter(Boolean).map((item) => <option key={item.id} value={item.id} data-avatar={getUserAvatar(item) || item.avatarUrl || ''} data-name={item.name}>{item.name}</option>)}
                  </Select>
                </label>
                <label className={styles.labeledField}>
                  <span>Cliente</span>
                  <div
                    className={styles.clientSearchField}
                    data-has-avatar={selectedDemandClient ? 'true' : undefined}
                    ref={clientSearchRef}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {selectedDemandClient ? (
                      <Avatar
                        src={getClientAvatar(selectedDemandClient) || selectedDemandClient.avatarUrl || undefined}
                        name={selectedDemandClient.name}
                        size="xs"
                        className={styles.clientSearchAvatar}
                      />
                    ) : null}
                    <input
                      value={clientSearchOpen ? clientQuery : selectedDemandClient?.name || clientQuery}
                      onFocus={() => {
                        if (selectedDemandClient) setClientQuery(selectedDemandClient.name || '');
                        openClientSearch();
                      }}
                      onMouseDown={() => {
                        if (!clientSearchOpen) openClientSearch();
                      }}
                      onChange={(event) => {
                        setClientQuery(event.target.value);
                        if (demandForm.clientId) setDemandForm((prev) => ({ ...prev, clientId: '' }));
                        openClientSearch();
                      }}
                      placeholder="Cliente"
                      aria-label="Cliente"
                    />
                    {(selectedDemandClient || clientQuery) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDemandForm((prev) => ({ ...prev, clientId: '' }));
                          setClientQuery('');
                          setClientSearchOpen(false);
                          setClientSearchPosition(null);
                        }}
                        aria-label="Limpar cliente"
                      >
                        <CloseIcon size={13} />
                      </button>
                    ) : null}
                  </div>
                </label>
                <label className={styles.labeledField}>
                  <span>Prazo</span>
                  <DateField value={demandForm.dueDate} onChange={(value) => setDemandForm((prev) => ({ ...prev, dueDate: value }))} placeholder="Prazo" ariaLabel="Prazo" className={styles.dateField} />
                </label>
                <label className={`${styles.labeledField} ${styles.fieldWide}`}>
                  <span>Colaboradores</span>
                  <Select
                    type="user"
                    value=""
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) return;
                      setDemandForm((prev) => ({
                        ...prev,
                        collaboratorUserIds: [...new Set([...(prev.collaboratorUserIds || []), value])],
                      }));
                    }}
                    aria-label="Colaboradores"
                    className={styles.formSelect}
                  >
                    <option value="">Adicionar colaborador</option>
                    {availableDemandCollaborators.map((item) => <option key={item.id} value={item.id} data-avatar={getUserAvatar(item) || item.avatarUrl || ''} data-name={item.name}>{item.name}</option>)}
                  </Select>
                </label>
                {selectedDemandCollaborators.length ? (
                  <div className={`${styles.selectedCollaborators} ${styles.fieldWide}`}>
                    {selectedDemandCollaborators.map((item) => (
                      <span key={item.id}>
                        {item.name}
                        <button
                          type="button"
                          onClick={() => setDemandForm((prev) => ({ ...prev, collaboratorUserIds: (prev.collaboratorUserIds || []).filter((id) => id !== item.id) }))}
                          aria-label={`Remover ${item.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {demandForm.type === 'briefing' ? (
                <div className={styles.briefingGrid}>
                  <input value={demandForm.officeName} onChange={(event) => setDemandForm((prev) => ({ ...prev, officeName: event.target.value }))} placeholder="Escritório" />
                  <input value={demandForm.objective} onChange={(event) => setDemandForm((prev) => ({ ...prev, objective: event.target.value }))} placeholder="Objetivo" />
                  <input value={demandForm.campaign} onChange={(event) => setDemandForm((prev) => ({ ...prev, campaign: event.target.value }))} placeholder="Nicho/campanha" />
                  <input value={demandForm.channels} onChange={(event) => setDemandForm((prev) => ({ ...prev, channels: event.target.value }))} placeholder="Canais" />
                  <input value={demandForm.attendants} onChange={(event) => setDemandForm((prev) => ({ ...prev, attendants: event.target.value }))} placeholder="Atendentes" />
                  <input value={demandForm.greeting} onChange={(event) => setDemandForm((prev) => ({ ...prev, greeting: event.target.value }))} placeholder="Saudação" />
                  <input value={demandForm.location} onChange={(event) => setDemandForm((prev) => ({ ...prev, location: event.target.value }))} placeholder="Localização" />
                  <textarea className={styles.fieldWide} value={demandForm.notes} onChange={(event) => setDemandForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Observações" />
                </div>
              ) : null}

              {demandForm.type === 'routine' ? (
                <div className={styles.routineFormGrid}>
                  <Select value={demandForm.recurrence} onChange={(event) => setDemandForm((prev) => ({ ...prev, recurrence: event.target.value }))} aria-label="Recorrência" className={`${styles.formSelect} ${styles.fieldThird}`}>
                    {ROUTINE_RECURRENCES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                  <input value={demandForm.routineScope} onChange={(event) => setDemandForm((prev) => ({ ...prev, routineScope: event.target.value }))} placeholder="Escopo" />
                  <textarea className={styles.fieldWide} value={demandForm.routineChecklist} onChange={(event) => setDemandForm((prev) => ({ ...prev, routineChecklist: event.target.value }))} placeholder="Checklist" />
                </div>
              ) : null}

              <textarea value={demandForm.description} onPaste={handleDemandPaste} onChange={(event) => setDemandForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Descrição" className={styles.demandTextarea} />

              <div className={styles.attachmentComposer}>
                <div>
                  <span>Anexos</span>
                  <strong>{(demandForm.attachments || []).length}</strong>
                </div>
                <input
                  ref={demandAttachmentInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  onChange={handleDemandAttachmentFiles}
                  hidden
                />
                <button type="button" onClick={() => demandAttachmentInputRef.current?.click()}>Anexar imagem ou PDF</button>
                {(demandForm.attachments || []).length ? (
                  <div className={styles.attachmentPreviewGrid}>
                    {(demandForm.attachments || []).map((item) => (
                      <figure key={item.id} className={styles.attachmentPreviewItem}>
                        {item.mimeType === 'application/pdf' ? (
                          <span className={styles.attachmentPdfPreview}>PDF</span>
                        ) : (
                          <img src={item.dataUrl} alt={item.fileName || 'Anexo'} loading="lazy" decoding="async" />
                        )}
                        <figcaption>{item.fileName || taskAttachmentKind(item)}</figcaption>
                        <button type="button" onClick={() => handleRemoveDemandAttachment(item.id)} aria-label={`Remover ${item.fileName || 'anexo'}`}>×</button>
                      </figure>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <footer className={styles.settingsFooter}>
              <button type="button" onClick={closeDemandModal}>Cancelar</button>
              <button type="submit" disabled={demandSaving || !canCreateDemand}>{demandSaving ? 'Criando' : 'Criar demanda'}</button>
            </footer>
          </form>
          {clientSearchOpen && clientSearchPosition ? createPortal(
            <div
              ref={clientSearchPanelRef}
              className={`${styles.clientSearchResults} ${styles.clientSearchFloating}`}
              style={{
                top: clientSearchPosition.top,
                left: clientSearchPosition.left,
                width: clientSearchPosition.width,
                maxHeight: clientSearchPosition.maxHeight,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              {filteredDemandClients.length ? filteredDemandClients.map((client) => {
                const clientAvatar = getClientAvatar(client) || client.avatarUrl || '';
                return (
                  <button
                    key={client.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setDemandForm((prev) => ({ ...prev, clientId: client.id }));
                      setClientQuery(client.name || '');
                      setClientSearchOpen(false);
                      setClientSearchPosition(null);
                    }}
                  >
                    <Avatar
                      src={clientAvatar || undefined}
                      name={client.name}
                      size="xs"
                      className={styles.clientSearchOptionAvatar}
                    />
                    <div className={styles.clientSearchOptionText}>
                      <strong>{client.name}</strong>
                      {client.squadName || client.managerName || client.gdvName ? (
                        <span>{[client.squadName, client.managerName, client.gdvName].filter(Boolean).join(' · ')}</span>
                      ) : null}
                    </div>
                  </button>
                );
              }) : (
                <span className={styles.clientSearchEmpty}>Sem cliente</span>
              )}
            </div>,
            document.body
          ) : null}
        </div>
      ) : null}


      {commentDeleteTarget ? (
        <div className={styles.settingsOverlay} onClick={closeCommentDeleteModal}>
          <section className={`${styles.settingsModal} ${styles.confirmModal}`} role="dialog" aria-modal="true" aria-label="Excluir comentário" onClick={(event) => event.stopPropagation()}>
            <header className={styles.settingsHeader}>
              <div>
                <h2>Excluir comentário</h2>
              </div>
              <button type="button" className={styles.iconButton} onClick={closeCommentDeleteModal} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>
            <footer className={styles.settingsFooter}>
              <button type="button" onClick={closeCommentDeleteModal}>Cancelar</button>
              <button type="button" onClick={handleDeleteComment} disabled={commentDeleting}>{commentDeleting ? 'Excluindo' : 'Excluir'}</button>
            </footer>
          </section>
        </div>
      ) : null}



      {taskDeleteTarget ? (
        <div className={styles.settingsOverlay} onClick={closeTaskDeleteModal}>
          <section className={`${styles.settingsModal} ${styles.confirmModal}`} role="dialog" aria-modal="true" aria-label="Excluir demanda" onClick={(event) => event.stopPropagation()}>
            <header className={styles.settingsHeader}>
              <div>
                <h2>Excluir demanda</h2>
                <span>{taskDeleteTarget.title}</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={closeTaskDeleteModal} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>
            <footer className={styles.settingsFooter}>
              <button type="button" onClick={closeTaskDeleteModal}>Cancelar</button>
              <button type="button" onClick={handleDeleteActiveTask} disabled={taskDeleting}>{taskDeleting ? 'Excluindo' : 'Excluir'}</button>
            </footer>
          </section>
        </div>
      ) : null}


      {subtaskDeleteTarget ? (
        <div className={styles.settingsOverlay} onClick={closeSubtaskDeleteModal}>
          <section className={`${styles.settingsModal} ${styles.confirmModal}`} role="dialog" aria-modal="true" aria-label="Excluir subtarefa" onClick={(event) => event.stopPropagation()}>
            <header className={styles.settingsHeader}>
              <div>
                <h2>Excluir subtarefa</h2>
                <span>{subtaskDeleteTarget.title}</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={closeSubtaskDeleteModal} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>
            <footer className={styles.settingsFooter}>
              <button type="button" onClick={closeSubtaskDeleteModal}>Cancelar</button>
              <button type="button" onClick={handleDeleteSubtask} disabled={subtaskDeleting}>{subtaskDeleting ? 'Excluindo' : 'Excluir'}</button>
            </footer>
          </section>
        </div>
      ) : null}


      {completionTarget ? (
        <div className={styles.settingsOverlay} onClick={closeCompletionModal}>
          <form className={`${styles.settingsModal} ${styles.completionModal}`} onSubmit={handleCompleteWithRecord} role="dialog" aria-modal="true" aria-label="Concluir demanda" onClick={(event) => event.stopPropagation()}>
            <header className={styles.settingsHeader}>
              <div>
                <h2>Concluir demanda</h2>
                <span>{completionTarget.title}</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={closeCompletionModal} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>
            <div className={styles.settingsContent}>
              <div className={styles.completionSummary}>
                <span>{kindLabel(getTaskKind(completionTarget))}</span>
                <strong>{completionTarget.clientName || completionTarget.projectName || '—'}</strong>
              </div>
              <div className={styles.completionGrid}>
                <label className={styles.completionField}>
                  <span>Resultado</span>
                  <textarea
                    value={completionForm.result}
                    onChange={(event) => setCompletionForm((prev) => ({ ...prev, result: event.target.value }))}
                  />
                </label>
                <label className={styles.completionField}>
                  <span>Pendências</span>
                  <textarea
                    value={completionForm.pending}
                    onChange={(event) => setCompletionForm((prev) => ({ ...prev, pending: event.target.value }))}
                  />
                </label>
                <label className={styles.completionField}>
                  <span>Próxima ação</span>
                  <input
                    value={completionForm.nextAction}
                    onChange={(event) => setCompletionForm((prev) => ({ ...prev, nextAction: event.target.value }))}
                  />
                </label>
                <label className={styles.completionField}>
                  <span>Observações</span>
                  <textarea
                    value={completionForm.notes}
                    onChange={(event) => setCompletionForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </label>
              </div>
            </div>
            <footer className={styles.settingsFooter}>
              <button type="button" onClick={closeCompletionModal}>Cancelar</button>
              <button type="submit" disabled={completionSaving}>{completionSaving ? 'Concluindo' : 'Concluir'}</button>
            </footer>
          </form>
        </div>
      ) : null}

      {handoffOpen && activeTask ? (
        <div className={styles.settingsOverlay} onClick={closeHandoffModal}>
          <form className={`${styles.settingsModal} ${styles.handoffModal}`} onSubmit={handleSubmitHandoff} role="dialog" aria-modal="true" aria-label="Passar etapa" onClick={(event) => event.stopPropagation()}>
            <header className={styles.settingsHeader}>
              <div>
                <h2>Passar etapa</h2>
                <span>{activeTask.title}</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={closeHandoffModal} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>
            <div className={styles.settingsContent}>
              <div className={styles.handoffGrid}>
                <label className={styles.labeledField}>
                  <span>Quem assume agora</span>
                  <Select
                    type="user"
                    value={handoffForm.assigneeUserId}
                    onChange={(event) => setHandoffForm((prev) => ({ ...prev, assigneeUserId: event.target.value }))}
                    aria-label="Quem assume agora"
                    className={styles.formSelect}
                  >
                    {assigneeOptions.map((item) => <option key={item.id} value={item.id} data-avatar={getUserAvatar(item) || item.avatarUrl || ''} data-name={item.name}>{item.name}</option>)}
                  </Select>
                </label>
                <label className={styles.labeledField}>
                  <span>Novo status</span>
                  <Select
                    value={handoffForm.status}
                    onChange={(event) => setHandoffForm((prev) => ({ ...prev, status: event.target.value }))}
                    aria-label="Novo status"
                    className={styles.formSelect}
                  >
                    {activeStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </label>
                <textarea
                  className={styles.fieldWide}
                  value={handoffForm.nextAction}
                  onChange={(event) => setHandoffForm((prev) => ({ ...prev, nextAction: event.target.value }))}
                  placeholder="Próxima ação"
                />
                <textarea
                  className={styles.fieldWide}
                  value={handoffForm.pending}
                  onChange={(event) => setHandoffForm((prev) => ({ ...prev, pending: event.target.value }))}
                  placeholder="Pendências"
                />
                <textarea
                  className={`${styles.fieldWide} ${styles.handoffContextField}`.trim()}
                  value={handoffForm.note}
                  onChange={(event) => setHandoffForm((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="Contexto para quem assume"
                />
              </div>
            </div>
            <footer className={styles.settingsFooter}>
              <button type="button" onClick={closeHandoffModal}>Cancelar</button>
              <button type="submit" disabled={handoffSaving || !handoffForm.assigneeUserId}>{handoffSaving ? 'Salvando' : 'Passar etapa'}</button>
            </footer>
          </form>
        </div>
      ) : null}

      {avatarPreviewOpen && avatarUrl ? (
        <div className={styles.avatarPreviewOverlay} role="presentation" onClick={() => setAvatarPreviewOpen(false)}>
          <section className={styles.avatarPreviewModal} role="dialog" aria-modal="true" aria-label="Foto do perfil" onClick={(event) => event.stopPropagation()}>
            <button type="button" className={styles.avatarPreviewClose} onClick={() => setAvatarPreviewOpen(false)} aria-label="Fechar">
              <CloseIcon size={16} />
            </button>
            <img src={avatarUrl} alt="" />
          </section>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className={styles.settingsOverlay} onClick={closeSettingsModal}>
          <section className={styles.settingsModal} role="dialog" aria-modal="true" aria-label="Configurações" onClick={(event) => event.stopPropagation()}>
            <header className={styles.settingsHeader}>
              <div>
                <h2>Configurações</h2>
                <span>{profileForm.name || user?.name}</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={closeSettingsModal} aria-label="Fechar">
                <CloseIcon size={16} />
              </button>
            </header>

            <div className={styles.settingsTabs}>
              {SETTINGS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={`${styles.settingsTab} ${settingsTab === tab.value ? styles.settingsTabActive : ''}`.trim()}
                  onClick={() => setSettingsTab(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className={styles.settingsPaneStack}>
              <div
                className={`${styles.settingsPane} ${settingsTab !== 'profile' ? styles.settingsPaneHidden : ''}`.trim()}
                aria-hidden={settingsTab !== 'profile'}
              >
                <div className={styles.photoRow}>
                  <button
                    type="button"
                    className={`${styles.photoAvatar} ${styles[`avatar_${profileForm.avatarColor || 'amber'}`]}`}
                    onClick={() => avatarUrl && setAvatarPreviewOpen(true)}
                    disabled={!avatarUrl}
                    aria-label={avatarUrl ? 'Visualizar foto' : undefined}
                    tabIndex={settingsTab === 'profile' ? 0 : -1}
                  >
                    {avatarUrl ? <img src={avatarUrl} alt="" decoding="async" draggable="false" /> : initials(profileForm.name || user?.name)}
                  </button>
                  <div className={styles.photoActions}>
                    <button type="button" onClick={() => avatarInputRef.current?.click()} tabIndex={settingsTab === 'profile' ? 0 : -1}>Alterar foto</button>
                    {avatarUrl ? <button type="button" onClick={handleRemoveAvatar} tabIndex={settingsTab === 'profile' ? 0 : -1}>Remover</button> : null}
                    <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarFile} hidden tabIndex={-1} />
                  </div>
                </div>

                <div className={styles.settingsColorGrid}>
                  {AVATAR_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`${styles.settingsColorOption} ${profileForm.avatarColor === option.value ? styles.settingsColorOptionActive : ''}`.trim()}
                      onClick={() => setProfileForm((prev) => ({ ...prev, avatarColor: option.value }))}
                      tabIndex={settingsTab === 'profile' ? 0 : -1}
                    >
                      <span className={`${styles.settingsColorAvatar} ${styles[`avatar_${option.value}`] || styles.avatar_amber}`}>
                        {initials(profileForm.name || user?.name)}
                      </span>
                      <strong>{option.label}</strong>
                    </button>
                  ))}
                </div>

                <div className={styles.settingsProfileGrid}>
                  <input value={profileForm.name} onChange={(event) => setProfileForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nome" tabIndex={settingsTab === 'profile' ? 0 : -1} />
                  <input value={profileForm.phone} onChange={(event) => setProfileForm((prev) => ({ ...prev, phone: event.target.value }))} placeholder="Telefone" tabIndex={settingsTab === 'profile' ? 0 : -1} />
                  <label className={styles.slugInputGroup}>
                    <span>/perfil/</span>
                    <input value={profileForm.customSlug} onChange={(event) => setProfileForm((prev) => ({ ...prev, customSlug: normalizeSlug(event.target.value) }))} placeholder="link-personalizado" tabIndex={settingsTab === 'profile' ? 0 : -1} />
                  </label>
                </div>
              </div>

              <div
                className={`${styles.settingsPane} ${settingsTab !== 'account' ? styles.settingsPaneHidden : ''}`.trim()}
                aria-hidden={settingsTab !== 'account'}
              >
                <div className={styles.formGrid}>
                  <input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))} placeholder="Senha atual" tabIndex={settingsTab === 'account' ? 0 : -1} />
                  <input type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))} placeholder="Nova senha" tabIndex={settingsTab === 'account' ? 0 : -1} />
                </div>
              </div>
            </div>

            <footer className={styles.settingsFooter}>
              {settingsTab === 'profile' ? (
                <button type="button" onClick={handleSaveProfile} disabled={savingProfile}>{savingProfile ? 'Salvando' : 'Salvar'}</button>
              ) : (
                <button type="button" onClick={handleChangePassword} disabled={savingPassword}>{savingPassword ? 'Salvando' : 'Salvar'}</button>
              )}
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
