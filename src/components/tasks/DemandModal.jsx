import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DateField from '../ui/DateField.jsx';
import { ChevronDownIcon, CloseIcon } from '../ui/Icons.jsx';
import { getClientAvatar, getUserAvatar } from '../../utils/avatarStorage.js';
import styles from './DemandModal.module.css';

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

const ROUTINE_RECURRENCES = [
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'one_time', label: 'Pontual' },
];


function initialsFrom(value = '') {
  const clean = String(value || '').trim();
  if (!clean) return '—';
  const parts = clean.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || '';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1] || '';
  return `${first}${second}`.toUpperCase();
}

function SelectAvatar({ src, name }) {
  return (
    <span className={styles.miniAvatar} aria-hidden="true">
      {src ? <img src={src} alt="" /> : <span>{initialsFrom(name)}</span>}
    </span>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function emptyForm(assigneeUserId = '', type = 'support') {
  return {
    type,
    title: '',
    description: '',
    assigneeUserId,
    clientId: '',
    dueDate: todayIso(),
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

function demandTypeLabel(type) {
  return DEMAND_TYPES.find((item) => item.value === type)?.label || 'Demanda';
}

function recurrenceLabel(value) {
  return ROUTINE_RECURRENCES.find((item) => item.value === value)?.label || value || '';
}

function buildDescription(form, clientName = '') {
  const lines = [`Tipo: ${demandTypeLabel(form.type)}`];
  if (clientName) lines.push(`Cliente: ${clientName}`);

  if (form.type === 'briefing') {
    const briefing = [
      ['Nome do escritório', form.officeName],
      ['Objetivo', form.objective],
      ['Nicho/campanha', form.campaign],
      ['Canais', form.channels],
      ['Atendentes', form.attendants],
      ['Saudação', form.greeting],
      ['Localização', form.location],
      ['Observações', form.notes],
    ].filter(([, value]) => cleanText(value)).map(([label, value]) => `${label}: ${cleanText(value)}`);
    if (briefing.length) lines.push('', 'Briefing', ...briefing);
  }

  if (form.type === 'routine') {
    const routine = [
      ['Recorrência', recurrenceLabel(form.recurrence)],
      ['Escopo', form.routineScope],
      ['Checklist', form.routineChecklist],
    ].filter(([, value]) => cleanText(value)).map(([label, value]) => `${label}: ${cleanText(value)}`);
    if (routine.length) lines.push('', 'Rotina', ...routine);
  }

  if (cleanText(form.description)) lines.push('', cleanText(form.description));
  return lines.join('\n');
}

function fileSignature(file) {
  return [file?.name || '', file?.size || 0, file?.lastModified || 0].join(':');
}

function attachmentSignature(item) {
  return [item?.fileName || '', item?.sizeBytes || 0, item?.mimeType || ''].join(':');
}

function filesFromClipboard(event) {
  return Array.from(event?.clipboardData?.items || [])
    .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
    .filter(Boolean);
}

function uniqueFiles(files = []) {
  const seen = new Set();
  return Array.from(files).filter((file) => {
    const key = fileSignature(file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readAttachmentFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('Arquivo inválido.'));
      return;
    }
    if (!file.type?.startsWith('image/') && file.type !== 'application/pdf') {
      reject(new Error('Envie imagem ou PDF.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size || 0,
      dataUrl: reader.result,
    });
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function attachmentKind(item) {
  if (item?.mimeType === 'application/pdf') return 'PDF';
  if (item?.mimeType?.startsWith('image/')) return 'Imagem';
  return 'Arquivo';
}

function Field({ label, className = '', children }) {
  return (
    <label className={`${styles.field} ${className}`.trim()}>
      <span className={styles.label}>{label}</span>
      {children}
    </label>
  );
}

function FloatingSelect({ value, options, onChange, placeholder = 'Selecionar', ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const selected = options.find((option) => String(option.value) === String(value));

  const updatePosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const maxHeight = Math.min(300, window.innerHeight - rect.bottom - 16);
    const next = { top: rect.bottom + 6, left: rect.left, width: rect.width, maxHeight: Math.max(132, maxHeight) };
    setPosition(next);
    return next;
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    const reposition = () => updatePosition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.selectWrap}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.selectButton}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          if (updatePosition()) setOpen(true);
        }}
      >
        {selected?.avatar || selected?.avatarName ? <SelectAvatar src={selected.avatar || undefined} name={selected.avatarName || selected.label} /> : null}
        <span className={styles.selectLabel}>{selected?.label || placeholder}</span>
        <ChevronDownIcon size={15} />
      </button>
      {open && position ? createPortal(
        <div
          ref={menuRef}
          className={styles.selectMenu}
          style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
          role="listbox"
        >
          {options.map((option) => {
            const active = String(option.value) === String(value);
            return (
              <button
                key={`${option.value}-${option.label}`}
                type="button"
                className={`${styles.selectOption} ${active ? styles.selectOptionActive : ''}`.trim()}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                role="option"
                aria-selected={active}
              >
                {option.avatar || option.avatarName ? <SelectAvatar src={option.avatar || undefined} name={option.avatarName || option.label} /> : null}
                <span className={styles.selectLabel}>{option.label}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export default function DemandModal({
  open,
  title = 'Nova demanda',
  defaultType = 'support',
  defaultAssigneeUserId = '',
  assigneeUsers = [],
  users = [],
  clients = [],
  creating = false,
  onClose,
  onSubmit,
  onError,
}) {
  const [form, setForm] = useState(() => emptyForm(defaultAssigneeUserId, defaultType));
  const [clientQuery, setClientQuery] = useState('');
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [clientSearchPosition, setClientSearchPosition] = useState(null);
  const attachmentInputRef = useRef(null);
  const clientSearchRef = useRef(null);
  const clientSearchPanelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm(defaultAssigneeUserId, defaultType));
    setClientQuery('');
    setClientSearchOpen(false);
    setClientSearchPosition(null);
  }, [defaultAssigneeUserId, defaultType, open]);

  const activeUsers = useMemo(() => users.filter((item) => item?.id && item?.active !== false), [users]);
  const availableAssignees = assigneeUsers.length ? assigneeUsers : activeUsers;
  const selectedClient = useMemo(() => clients.find((client) => String(client.id) === String(form.clientId)) || null, [clients, form.clientId]);
  const selectedCollaborators = useMemo(() => {
    const ids = new Set(form.collaboratorUserIds || []);
    return activeUsers.filter((item) => ids.has(item.id));
  }, [activeUsers, form.collaboratorUserIds]);
  const collaboratorOptions = useMemo(() => {
    const selected = new Set([form.assigneeUserId, ...(form.collaboratorUserIds || [])].filter(Boolean));
    return activeUsers.filter((item) => !selected.has(item.id));
  }, [activeUsers, form.assigneeUserId, form.collaboratorUserIds]);
  const filteredClients = useMemo(() => {
    const term = cleanText(clientQuery).toLowerCase();
    const source = Array.isArray(clients) ? clients : [];
    if (!term) return source.slice(0, 12);
    return source.filter((client) => String(client.name || '').toLowerCase().includes(term)).slice(0, 12);
  }, [clients, clientQuery]);

  const userOptions = useMemo(() => availableAssignees.map((item) => ({
    value: item.id,
    label: item.name,
    avatar: getUserAvatar(item) || item.avatarUrl || '',
    avatarName: item.name,
  })), [availableAssignees]);

  const collaboratorSelectOptions = useMemo(() => [
    { value: '', label: 'Adicionar colaborador' },
    ...collaboratorOptions.map((item) => ({ value: item.id, label: item.name, avatar: getUserAvatar(item) || item.avatarUrl || '', avatarName: item.name })),
  ], [collaboratorOptions]);

  const openClientSearch = () => {
    const rect = clientSearchRef.current?.getBoundingClientRect();
    if (!rect) return;
    setClientSearchPosition({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(132, Math.min(320, window.innerHeight - rect.bottom - 16)),
    });
    setClientSearchOpen(true);
  };

  useLayoutEffect(() => {
    if (!clientSearchOpen) return undefined;
    const reposition = () => openClientSearch();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [clientSearchOpen]);

  useEffect(() => {
    if (!clientSearchOpen) return undefined;
    const handlePointerDown = (event) => {
      if (clientSearchRef.current?.contains(event.target) || clientSearchPanelRef.current?.contains(event.target)) return;
      setClientSearchOpen(false);
      setClientSearchPosition(null);
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, [clientSearchOpen]);

  async function addAttachments(files) {
    const selected = uniqueFiles(files).filter(Boolean);
    if (!selected.length) return;
    try {
      const parsed = await Promise.all(selected.map(readAttachmentFile));
      setForm((current) => {
        const existing = Array.isArray(current.attachments) ? current.attachments : [];
        const seen = new Set(existing.map(attachmentSignature));
        const next = parsed.filter((item) => {
          const key = attachmentSignature(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return { ...current, attachments: [...existing, ...next].slice(0, 8) };
      });
    } catch (err) {
      onError?.(err?.message || 'Não foi possível anexar o arquivo.');
    }
  }

  if (!open) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    const nextTitle = cleanText(form.title);
    if (!nextTitle) {
      onError?.('Informe o título da demanda.');
      return;
    }
    const description = buildDescription(form, selectedClient?.name || '');
    await onSubmit?.({ ...form, title: nextTitle, description });
  }

  return createPortal(
    <div className={styles.overlay} onClick={(event) => event.stopPropagation()}>
      <form
        className={`${styles.modal} ${form.type === 'briefing' ? styles.modalBriefing : ''}`.trim()}
        onSubmit={handleSubmit}
        onPaste={(event) => {
          const files = filesFromClipboard(event);
          if (!files.length) return;
          event.preventDefault();
          addAttachments(files);
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className={styles.header}>
          <div>
            <h2>{title}</h2>
            <span>{demandTypeLabel(form.type)}</span>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar">
            <CloseIcon size={16} />
          </button>
        </header>

        <div className={styles.content}>
          <div className={styles.grid}>
            <Field label="Tipo" className={styles.fieldCompact}>
              <FloatingSelect value={form.type} options={DEMAND_TYPES} onChange={(value) => setForm((prev) => ({ ...prev, type: value }))} ariaLabel="Tipo" />
            </Field>
            <Field label="Prioridade" className={styles.fieldCompact}>
              <FloatingSelect value={form.priority} options={DEMAND_PRIORITIES} onChange={(value) => setForm((prev) => ({ ...prev, priority: value }))} ariaLabel="Prioridade" />
            </Field>
            <Field label="Título" className={styles.fieldWide}>
              <input className={styles.input} value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Título" />
            </Field>
            <Field label="Para quem é esta tarefa?" className={styles.fieldWide}>
              <FloatingSelect
                value={form.assigneeUserId}
                options={userOptions}
                onChange={(value) => setForm((prev) => ({ ...prev, assigneeUserId: value, collaboratorUserIds: (prev.collaboratorUserIds || []).filter((id) => id !== value) }))}
                ariaLabel="Responsável"
              />
            </Field>
            <Field label="Cliente" className={styles.fieldWide}>
              <div className={styles.clientSearchField} ref={clientSearchRef}>
                {selectedClient ? <SelectAvatar src={getClientAvatar(selectedClient) || selectedClient.avatarUrl || undefined} name={selectedClient.name} /> : null}
                <input
                  value={clientSearchOpen ? clientQuery : selectedClient?.name || clientQuery}
                  onFocus={() => {
                    if (selectedClient) setClientQuery(selectedClient.name || '');
                    openClientSearch();
                  }}
                  onMouseDown={() => {
                    if (!clientSearchOpen) openClientSearch();
                  }}
                  onChange={(event) => {
                    setClientQuery(event.target.value);
                    if (form.clientId) setForm((prev) => ({ ...prev, clientId: '' }));
                    openClientSearch();
                  }}
                  placeholder="Cliente"
                  aria-label="Cliente"
                />
                {(selectedClient || clientQuery) ? (
                  <button type="button" className={styles.clearClient} onClick={() => {
                    setForm((prev) => ({ ...prev, clientId: '' }));
                    setClientQuery('');
                    setClientSearchOpen(false);
                    setClientSearchPosition(null);
                  }} aria-label="Limpar cliente">
                    <CloseIcon size={13} />
                  </button>
                ) : null}
              </div>
            </Field>
            <Field label="Prazo" className={styles.fieldWide}>
              <DateField value={form.dueDate} onChange={(value) => setForm((prev) => ({ ...prev, dueDate: value }))} placeholder="Prazo" ariaLabel="Prazo" className={styles.dateWrap} />
            </Field>
            <Field label="Colaboradores adicionais" className={styles.fieldWide}>
              <FloatingSelect
                value=""
                options={collaboratorSelectOptions}
                onChange={(value) => {
                  if (!value) return;
                  setForm((prev) => ({ ...prev, collaboratorUserIds: [...new Set([...(prev.collaboratorUserIds || []), value])] }));
                }}
                ariaLabel="Colaboradores"
              />
            </Field>
            {selectedCollaborators.length ? (
              <div className={styles.selectedCollaborators}>
                {selectedCollaborators.map((item) => (
                  <span key={item.id}>
                    {item.name}
                    <button type="button" onClick={() => setForm((prev) => ({ ...prev, collaboratorUserIds: (prev.collaboratorUserIds || []).filter((id) => id !== item.id) }))} aria-label={`Remover ${item.name}`}>×</button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {form.type === 'briefing' ? (
            <div className={styles.briefingGrid}>
              <input className={styles.input} value={form.officeName} onChange={(event) => setForm((prev) => ({ ...prev, officeName: event.target.value }))} placeholder="Escritório" />
              <input className={styles.input} value={form.objective} onChange={(event) => setForm((prev) => ({ ...prev, objective: event.target.value }))} placeholder="Objetivo" />
              <input className={styles.input} value={form.campaign} onChange={(event) => setForm((prev) => ({ ...prev, campaign: event.target.value }))} placeholder="Nicho/campanha" />
              <input className={styles.input} value={form.channels} onChange={(event) => setForm((prev) => ({ ...prev, channels: event.target.value }))} placeholder="Canais" />
              <input className={styles.input} value={form.attendants} onChange={(event) => setForm((prev) => ({ ...prev, attendants: event.target.value }))} placeholder="Atendentes" />
              <input className={styles.input} value={form.greeting} onChange={(event) => setForm((prev) => ({ ...prev, greeting: event.target.value }))} placeholder="Saudação" />
              <input className={styles.input} value={form.location} onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} placeholder="Localização" />
              <textarea className={`${styles.textarea} ${styles.fieldFull}`} value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Observações" />
            </div>
          ) : null}

          {form.type === 'routine' ? (
            <div className={styles.routineGrid}>
              <div className={styles.fieldCompact}>
                <FloatingSelect value={form.recurrence} options={ROUTINE_RECURRENCES} onChange={(value) => setForm((prev) => ({ ...prev, recurrence: value }))} ariaLabel="Recorrência" />
              </div>
              <input className={`${styles.input} ${styles.fieldWide}`} value={form.routineScope} onChange={(event) => setForm((prev) => ({ ...prev, routineScope: event.target.value }))} placeholder="Escopo" />
              <textarea className={`${styles.textarea} ${styles.fieldFull}`} value={form.routineChecklist} onChange={(event) => setForm((prev) => ({ ...prev, routineChecklist: event.target.value }))} placeholder="Checklist" />
            </div>
          ) : null}

          <textarea className={styles.textarea} value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Descrição" />

          <div className={styles.attachmentComposer}>
            <div className={styles.attachmentHeader}><span>Anexos</span><strong>{(form.attachments || []).length}</strong></div>
            <input ref={attachmentInputRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(event) => {
              const files = Array.from(event.target.files || []);
              if (files.length) addAttachments(files);
              event.target.value = '';
            }} />
            <button type="button" className={styles.attachmentButton} onClick={() => attachmentInputRef.current?.click()}>Anexar imagem ou PDF</button>
            {(form.attachments || []).length ? (
              <div className={styles.attachmentGrid}>
                {form.attachments.map((item) => (
                  <figure key={item.id} className={styles.attachmentItem}>
                    {item.mimeType === 'application/pdf' ? <span className={styles.pdfPreview}>PDF</span> : <img src={item.dataUrl} alt={item.fileName || 'Anexo'} loading="lazy" decoding="async" />}
                    <figcaption>{item.fileName || attachmentKind(item)}</figcaption>
                    <button type="button" onClick={() => setForm((prev) => ({ ...prev, attachments: (prev.attachments || []).filter((attachment) => attachment.id !== item.id) }))} aria-label={`Remover ${item.fileName || 'anexo'}`}>×</button>
                  </figure>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <footer className={styles.footer}>
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={creating}>{creating ? 'Criando' : 'Criar demanda'}</button>
        </footer>
      </form>
      {clientSearchOpen && clientSearchPosition ? createPortal(
        <div
          ref={clientSearchPanelRef}
          className={styles.clientMenu}
          style={{ top: clientSearchPosition.top, left: clientSearchPosition.left, width: clientSearchPosition.width, maxHeight: clientSearchPosition.maxHeight }}
        >
          {filteredClients.length ? filteredClients.map((client) => (
            <button key={client.id} type="button" className={styles.clientOption} onMouseDown={(event) => event.preventDefault()} onClick={() => {
              setForm((prev) => ({ ...prev, clientId: client.id }));
              setClientQuery(client.name || '');
              setClientSearchOpen(false);
              setClientSearchPosition(null);
            }}>
              <SelectAvatar src={getClientAvatar(client) || client.avatarUrl || undefined} name={client.name} />
              <div className={styles.clientOptionText}>
                <strong>{client.name}</strong>
                {client.squadName || client.managerName || client.gdvName ? <span>{[client.squadName, client.managerName, client.gdvName].filter(Boolean).join(' · ')}</span> : null}
              </div>
            </button>
          )) : <span className={styles.clientEmpty}>Sem cliente</span>}
        </div>,
        document.body,
      ) : null}
    </div>,
    document.body,
  );
}
