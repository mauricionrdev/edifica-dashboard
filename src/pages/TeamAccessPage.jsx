import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { createGdv, updateGdv } from '../api/gdvs.js';
import { createSquad, deleteSquad, updateSquad } from '../api/squads.js';
import { createUser, deleteUser, listUsers, resetUserPassword, toggleUserActive, updateUser } from '../api/users.js';
import { listAccessRequests, updateAccessRequest } from '../api/accessRequests.js';
import { listAuditLogs, listAuditLogFilters } from '../api/auditLogs.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { roleLabel } from '../utils/roles.js';
import { PERMISSION_GROUPS, ROLE_ORDER, getRoleSummary, hasPermission, normalizePermissionList, permissionLabel } from '../utils/permissions.js';
import {
  BuildingIcon,
  PlusIcon,
  ShieldIcon,
  UsersIcon,
  MailIcon,
} from '../components/ui/Icons.jsx';
import StateBlock from '../components/ui/StateBlock.jsx';
import { Select } from '../components/ui/index.js';
import UserPicker from '../components/users/UserPicker.jsx';
import { readAvatarFile } from '../utils/avatarStorage.js';
import { matchesAnySearch } from '../utils/search.js';
import styles from './TeamAccessPage.module.css';

const SECONDARY_ROLE_OPTIONS = ROLE_ORDER.filter((role) => !['ceo', 'suporte_tecnologia', 'admin'].includes(role));

function userHasRole(entry, role) {
  return entry?.role === role || (Array.isArray(entry?.secondaryRoles) && entry.secondaryRoles.includes(role));
}

function effectiveRoleLabels(entry) {
  const secondary = Array.isArray(entry?.secondaryRoles) ? entry.secondaryRoles : [];
  return [entry?.role, ...secondary].filter(Boolean).map((role) => roleLabel(role));
}

function squadInitials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'SQ';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function SquadFormModal({ mode = 'create', initialName = '', busy = false, onClose, onSubmit }) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="squad-form-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHead}>
          <div>
            <span className={styles.modalEyebrow}>Estrutura operacional</span>
            <h3 id="squad-form-title">{mode === 'create' ? 'Novo squad' : 'Editar squad'}</h3>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <p className={styles.modalText}>
          O squad organiza carteira, leitura de performance e permissões do time.
          Mantenha nomes claros e padronizados para a operação.
        </p>

        <label className={styles.field}>
          <span>Nome do squad</span>
          <input autoFocus type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Squad Comercial Sul" maxLength={80} />
        </label>

        <div className={styles.modalActions}>
          <button type="button" className={styles.ghostButton} onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className={styles.primaryButton} onClick={() => onSubmit(name)} disabled={busy || !name.trim()}>
            {busy ? 'Salvando…' : mode === 'create' ? 'Criar squad' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
function EnhancedSquadFormModal({
  mode = 'create',
  squad = null,
  busy = false,
  deleting = false,
  onClose,
  onSubmit,
  onDelete,
}) {
  const [name, setName] = useState(squad?.name || '');

  useEffect(() => {
    setName(squad?.name || '');
  }, [squad?.id, squad?.name]);

  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="enhanced-squad-form-title" onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHead}>
          <div>
            <span className={styles.modalEyebrow}>Estrutura operacional</span>
            <h3 id="enhanced-squad-form-title">{mode === 'create' ? 'Novo squad' : 'Editar squad'}</h3>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className={styles.userModalBody}>
        {mode === 'edit' && squad ? (
            <div className={styles.requestSummary}>
              <article className={styles.requestSummaryCard}>
                <span>Clientes</span>
                <strong>{squad.clientsCount || 0}</strong>
                <small>{squad.activeClients || 0} ativos na carteira</small>
              </article>
              <article className={styles.requestSummaryCard}>
                <span>Gestores</span>
                <strong>{squad.gestors || 0}</strong>
                <small>{squad.createdAt ? `criado em ${new Date(squad.createdAt).toLocaleDateString('pt-BR')}` : 'estrutura ativa'}</small>
              </article>
            </div>
          ) : null}

          <label className={styles.field}>
            <span>Nome do squad</span>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Squad Comercial Sul"
              maxLength={80}
            />
          </label>

          {mode === 'edit' && squad?.id ? (
            <div className={styles.selectorBlock}>
              <div className={styles.selectorHead}>
                <strong>Ações do squad</strong>
              </div>
              <div className={styles.rowActions}>
                <Link to={`/squads/${encodeURIComponent(squad.id)}`} className={styles.dashboardLink} onClick={onClose}>
                  Abrir dashboard
                </Link>
                <button type="button" className={styles.dangerButton} onClick={() => onDelete?.(squad)} disabled={busy || deleting}>
                  {deleting ? 'Removendo...' : 'Excluir squad'}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.modalActions}>
          <button type="button" className={styles.ghostButton} onClick={onClose} disabled={busy || deleting}>Cancelar</button>
          <button type="button" className={styles.primaryButton} onClick={() => onSubmit(name)} disabled={busy || deleting || !name.trim()}>
            {busy ? 'Salvando...' : mode === 'create' ? 'Criar squad' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
function SquadOwnerFormModal({
  mode = 'create',
  squad = null,
  users = [],
  canEditOwner = false,
  busy = false,
  deleting = false,
  onClose,
  onSubmit,
  onDelete,
}) {
  const fileInputRef = useRef(null);
  const [name, setName] = useState(squad?.name || '');
  const [ownerUserId, setOwnerUserId] = useState(squad?.ownerUserId || squad?.ownerId || squad?.owner?.id || '');
  const [logoUrl, setLogoUrl] = useState(squad?.logoUrl || '');

  useEffect(() => {
    setName(squad?.name || '');
    setOwnerUserId(squad?.ownerUserId || squad?.ownerId || squad?.owner?.id || '');
    setLogoUrl(squad?.logoUrl || '');
  }, [squad?.id, squad?.name, squad?.ownerUserId, squad?.ownerId, squad?.owner, squad?.logoUrl]);

  const owner = users.find((entry) => entry.id === ownerUserId) || null;
  const statusLabel = owner ? 'Ativo' : 'Desativado';

  async function handleLogoFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const dataUrl = await readAvatarFile(file);
    setLogoUrl(dataUrl);
  }

  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="squad-owner-form-title" onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHead}>
          <div>
            <span className={styles.modalEyebrow}>Estrutura operacional</span>
            <h3 id="squad-owner-form-title">{mode === 'create' ? 'Novo squad' : 'Editar squad'}</h3>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className={styles.userModalBody}>
          <section className={styles.squadIdentityPanel}>
            <input ref={fileInputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={handleLogoFile} />
            <button type="button" className={styles.squadAvatarEditor} onClick={() => fileInputRef.current?.click()}>
              {logoUrl ? <img src={logoUrl} alt="" /> : <span>{squadInitials(name)}</span>}
            </button>
            <div className={styles.squadIdentityFields}>
              <label className={styles.field}>
                <span>Nome do squad</span>
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex.: Squad Comercial Sul"
                  maxLength={80}
                />
              </label>
              <div className={styles.rowActions}>
                <button type="button" className={styles.ghostButton} onClick={() => fileInputRef.current?.click()}>
                  Alterar avatar
                </button>
                {logoUrl ? (
                  <button type="button" className={styles.ghostButton} onClick={() => setLogoUrl('')}>
                    Remover avatar
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Status operacional</span>
              <input value={statusLabel} disabled />
            </label>

            <label className={styles.field}>
              <span>Proprietário do squad</span>
              {canEditOwner ? (
                <UserPicker
                  users={users}
                  value={ownerUserId}
                  onChange={setOwnerUserId}
                  placeholder="Sem proprietário"
                  showRole
                  portal
                  disableHover
                />
              ) : (
                <input value={owner?.name || 'Sem proprietário'} disabled />
              )}
            </label>
          </div>

          {mode === 'edit' && squad?.id ? (
            <div className={styles.selectorBlock}>
              <div className={styles.selectorHead}>
                <strong>Ações do squad</strong>
              </div>
              <div className={styles.rowActions}>
                <Link to={`/squads/${encodeURIComponent(squad.id)}`} className={styles.dashboardLink} onClick={onClose}>
                  Abrir dashboard
                </Link>
                <button type="button" className={styles.dangerButton} onClick={() => onDelete?.(squad)} disabled={busy || deleting}>
                  {deleting ? 'Removendo...' : 'Excluir squad'}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.modalActions}>
          <button type="button" className={styles.ghostButton} onClick={onClose} disabled={busy || deleting}>Cancelar</button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => onSubmit({ name, ownerUserId, active: Boolean(ownerUserId), logoUrl })}
            disabled={busy || deleting || !name.trim()}
          >
            {busy ? 'Salvando...' : mode === 'create' ? 'Criar squad' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
function UserFormModal({
  mode = 'create',
  user = null,
  initialRole = 'gestor',
  squads = [],
  busy = false,
  permissionGroups = PERMISSION_GROUPS,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || initialRole,
    secondaryRoles: Array.isArray(user?.secondaryRoles) ? user.secondaryRoles : [],
    squads: Array.isArray(user?.squads) ? user.squads : [],
    permissionsOverride: normalizePermissionList(user?.permissionsOverride),
  });

  useEffect(() => {
    setForm({
      name: user?.name || '',
      email: user?.email || '',
      password: '',
      role: user?.role || initialRole,
      secondaryRoles: Array.isArray(user?.secondaryRoles) ? user.secondaryRoles : [],
      squads: Array.isArray(user?.squads) ? user.squads : [],
      permissionsOverride: normalizePermissionList(user?.permissionsOverride),
    });
  }, [user, initialRole]);

  function updateField(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'role' ? { secondaryRoles: prev.secondaryRoles.filter((role) => role !== value) } : {}),
    }));
  }

  function toggleSecondaryRole(role) {
    setForm((prev) => ({
      ...prev,
      secondaryRoles: prev.secondaryRoles.includes(role)
        ? prev.secondaryRoles.filter((item) => item !== role)
        : [...prev.secondaryRoles, role].filter((item) => item !== prev.role),
    }));
  }

  function toggleSquadSelection(id) {
    setForm((prev) => ({
      ...prev,
      squads: prev.squads.includes(id) ? prev.squads.filter((item) => item !== id) : [...prev.squads, id],
    }));
  }

  function togglePermission(permission) {
    setForm((prev) => ({
      ...prev,
      permissionsOverride: prev.permissionsOverride.includes(permission)
        ? prev.permissionsOverride.filter((item) => item !== permission)
        : [...prev.permissionsOverride, permission],
    }));
  }

  const canSubmit = form.name.trim() && form.email.trim() && (mode === 'edit' || form.password.trim());
  const permissionColumns = useMemo(() => {
    const sortedGroups = [...permissionGroups].sort((a, b) => {
      if (b.permissions.length !== a.permissions.length) return b.permissions.length - a.permissions.length;
      return a.area.localeCompare(b.area, 'pt-BR');
    });
    const columns = Array.from({ length: 3 }, () => ({ groups: [], weight: 0 }));
    sortedGroups.forEach((group) => {
      let targetIndex = 0;
      for (let index = 1; index < columns.length; index += 1) {
        if (columns[index].weight < columns[targetIndex].weight) targetIndex = index;
      }
      columns[targetIndex].groups.push(group);
      columns[targetIndex].weight += group.permissions.length;
    });
    return columns.filter((column) => column.groups.length > 0).map((column) => column.groups);
  }, [permissionGroups]);

  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <div className={`${styles.modalCard} ${styles.userModalCard}`} role="dialog" aria-modal="true" aria-labelledby="user-form-title" onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHead}>
          <div>
            <span className={styles.modalEyebrow}>Equipe e acessos</span>
            <h3 id="user-form-title">{mode === 'create' ? 'Novo usuário' : 'Editar usuário'}</h3>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className={styles.userModalBody}>
          <section className={styles.modalSection}>
            <div className={styles.formGrid}>
              <label className={styles.field}><span>Nome</span><input autoFocus type="text" value={form.name} onChange={(event) => updateField('name', event.target.value)} placeholder="Ex.: Maurício Nunes" maxLength={120} /></label>
              <label className={styles.field}><span>E-mail</span><input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} placeholder="nome@empresa.com" maxLength={160} /></label>
              <label className={styles.field}><span>{mode === 'create' ? 'Senha inicial' : 'Nova senha (opcional)'}</span><input type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} placeholder={mode === 'create' ? 'Obrigatória para criar' : 'Preencha apenas se quiser trocar'} /></label>
              <label className={styles.field}>
                <span>Cargo</span>
                <Select value={form.role} onChange={(event) => updateField('role', event.target.value)} aria-label="Cargo do usuário">
                  <option value="ceo">CEO</option>
                  <option value="suporte_tecnologia">Suporte de tecnologia (TI)</option>
                  {mode === 'edit' && form.role === 'admin' ? <option value="admin">Administrador legado</option> : null}
                  <option value="gdv">GDV</option>
                  <option value="gestor">Gestor de Tráfego</option>
                  <option value="cap">CAP</option>
                </Select>
              </label>
            </div>
          </section>


          <section className={styles.selectorBlock}>
            <div className={styles.selectorHead}><strong>Escopo de squads</strong><span>{form.squads.length} selecionado(s)</span></div>
            <div className={styles.squadSelectGrid}>
              {squads.map((squad) => {
                const checked = form.squads.includes(squad.id);
                return (
                  <label key={squad.id} className={`${styles.checkboxCard} ${checked ? styles.checkboxCardActive : ''}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSquadSelection(squad.id)} />
                    <span>{squad.name}</span>
                  </label>
                );
              })}
              {squads.length === 0 ? <div className={styles.selectorEmpty}>Nenhum squad cadastrado ainda.</div> : null}
            </div>
          </section>

          <section className={styles.selectorBlock}>
            <div className={styles.selectorHead}><strong>Permissões complementares</strong><span>{form.permissionsOverride.length} marcada(s)</span></div>
            <div className={styles.permissionSelectGrid}>
              {permissionColumns.map((column, columnIndex) => (
                <div key={`permission-column-${columnIndex + 1}`} className={styles.permissionColumn}>
                  {column.map((group) => (
                    <div key={group.area} className={styles.checkboxGroup}>
                      <strong className={styles.selectorGroupTitle}>{group.area}</strong>
                      {group.permissions.map((permission) => {
                        const checked = form.permissionsOverride.includes(permission);
                        return (
                          <label key={permission} className={`${styles.checkboxCard} ${styles.permissionOptionCard} ${checked ? styles.checkboxCardActive : ''}`}>
                            <input type="checkbox" checked={checked} onChange={() => togglePermission(permission)} />
                            <PermissionText permission={permission} showHint />
                            <PermissionScopeBadge permission={permission} />
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className={styles.modalActions}>
          <button type="button" className={styles.ghostButton} onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className={styles.primaryButton} onClick={() => onSubmit(form)} disabled={busy || !canSubmit}>
            {busy ? 'Salvando…' : mode === 'create' ? 'Criar usuário' : 'Salvar usuário'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteUserModal({ user, busy = false, onClose, onConfirm }) {
  if (!user) return null;

  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-user-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHead}>
          <div>
            <span className={styles.modalEyebrow}>Equipe e acessos</span>
            <h3 id="confirm-delete-user-title">Confirmar exclusão de usuário</h3>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className={styles.userModalBody}>
          <p className={styles.modalText}>
            Você está prestes a excluir <strong>{user.name}</strong>. Essa ação remove o acesso do usuário à plataforma
            e deve ser usada apenas quando tiver certeza.
          </p>

          <div className={styles.selectorBlock}>
            <div className={styles.textStack}>
              <strong>{user.name}</strong>
              <small className={styles.dimText}>{user.email}</small>
            </div>
          </div>
        </div>

        <div className={styles.modalActions}>
          <button type="button" className={styles.ghostButton} onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className={styles.dangerButton} onClick={() => onConfirm(user)} disabled={busy}>
            {busy ? 'Excluindo...' : 'Excluir usuário'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestReviewModal({ request, squads = [], busy = false, onClose, onSubmit }) {
  const isInvite = request?.type === 'invite';
  const [form, setForm] = useState({
    status: 'approved',
    role: 'gestor',
    squads: [],
    password: '',
    resolutionNote: '',
  });

  useEffect(() => {
    setForm({
      status: 'approved',
      role: 'gestor',
      squads: [],
      password: '',
      resolutionNote: '',
    });
  }, [request?.id]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleSquadSelection(id) {
    setForm((prev) => ({
      ...prev,
      squads: prev.squads.includes(id)
        ? prev.squads.filter((item) => item !== id)
        : [...prev.squads, id],
    }));
  }

  function togglePermission(permission) {
    setForm((prev) => ({
      ...prev,
      permissionsOverride: prev.permissionsOverride.includes(permission)
        ? prev.permissionsOverride.filter((item) => item !== permission)
        : [...prev.permissionsOverride, permission],
    }));
  }

  const approvalPayload = form.status === 'approved'
    ? {
        password: form.password,
        ...(isInvite ? { role: form.role, squads: form.squads } : {}),
      }
    : undefined;

  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <div
        className={`${styles.modalCard} ${styles.userModalCard}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-review-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHead}>
          <div>
            <span className={styles.modalEyebrow}>Solicitações</span>
            <h3 id="request-review-title">
              {isInvite ? 'Triagem de convite de acesso' : 'Triagem de redefinição de senha'}
            </h3>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className={styles.userModalBody}>
          <div className={styles.requestSummary}>
            <article className={styles.requestSummaryCard}>
              <span>Solicitante</span>
              <strong>{request?.requesterName || request?.requesterIdentifier || 'Solicitante'}</strong>
              <small>{request?.requesterEmail || request?.company || 'Sem e-mail informado'}</small>
            </article>
            <article className={styles.requestSummaryCard}>
              <span>Tipo</span>
              <strong>{isInvite ? 'Convite de acesso' : 'Redefinição de senha'}</strong>
              <small>{request?.createdAt ? new Date(request.createdAt).toLocaleString('pt-BR') : 'Agora'}</small>
            </article>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Decisão</span>
              <Select value={form.status} onChange={(event) => updateField('status', event.target.value)} aria-label="Decisão da solicitação">
                <option value="approved">Aprovar</option>
                <option value="rejected">Rejeitar</option>
              </Select>
            </label>

            <label className={styles.field}>
              <span>{form.status === 'approved' ? 'Senha temporária (opcional)' : 'Motivo / observação'}</span>
              <input
                type="text"
                value={form.status === 'approved' ? form.password : form.resolutionNote}
                onChange={(event) =>
                  form.status === 'approved'
                    ? updateField('password', event.target.value)
                    : updateField('resolutionNote', event.target.value)
                }
                placeholder={
                  form.status === 'approved'
                    ? 'Opcional'
                    : 'Ex.: e-mail não autorizado'
                }
              />
            </label>
          </div>

          {form.status === 'approved' && isInvite ? (
            <>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Papel inicial</span>
                  <Select value={form.role} onChange={(event) => updateField('role', event.target.value)} aria-label="Papel inicial do convite">
                    <option value="ceo">CEO</option>
                    <option value="suporte_tecnologia">Suporte de tecnologia (TI)</option>

                    <option value="gdv">GDV</option>
                    <option value="gestor">Gestor de Tráfego</option>
                    <option value="cap">CAP</option>
                  </Select>
                </label>

                <label className={styles.field}>
                  <span>Observação interna</span>
                  <input
                    type="text"
                    value={form.resolutionNote}
                    onChange={(event) => updateField('resolutionNote', event.target.value)}
                    placeholder="Opcional para auditoria interna"
                  />
                </label>
              </div>

              <div className={styles.selectorBlock}>
                <div className={styles.selectorHead}>
                  <strong>Squads iniciais</strong>
                  <span>{form.squads.length} selecionado(s)</span>
                </div>
                <div className={styles.checkboxGrid}>
                  {squads.map((squad) => {
                    const checked = form.squads.includes(squad.id);
                    return (
                      <label key={squad.id} className={`${styles.checkboxCard} ${checked ? styles.checkboxCardActive : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSquadSelection(squad.id)}
                        />
                        <span>{squad.name}</span>
                      </label>
                    );
                  })}
                  {squads.length === 0 ? (
                    <div className={styles.selectorEmpty}>Nenhum squad cadastrado ainda.</div>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}

          {form.status === 'approved' && !isInvite ? (
            <label className={styles.field}>
              <span>Observação interna</span>
              <input
                type="text"
                value={form.resolutionNote}
                onChange={(event) => updateField('resolutionNote', event.target.value)}
                placeholder="Opcional para auditoria interna"
              />
            </label>
          ) : null}
        </div>

        <div className={styles.modalActions}>
          <button type="button" className={styles.ghostButton} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className={form.status === 'approved' ? styles.primaryButton : styles.dangerButton}
            onClick={() => onSubmit({ status: form.status, resolutionNote: form.resolutionNote, approval: approvalPayload })}
            disabled={busy}
          >
            {busy ? 'Salvando…' : form.status === 'approved' ? 'Confirmar aprovação' : 'Confirmar rejeição'}
          </button>
        </div>
      </div>
    </div>
  );
}


function getPermissionMeta(permission) {
  const key = String(permission || '');
  if (key === '*' || key.endsWith('.all')) {
    return { scope: 'Todos', tone: 'all', hint: 'Acesso amplo aos dados da área.' };
  }
  if (key.endsWith('.own')) {
    return { scope: 'Próprio escopo', tone: 'own', hint: 'Limitado a squads, vínculos ou responsabilidades do usuário.' };
  }
  if (key.endsWith('.edit.all')) {
    return { scope: 'Editar todos', tone: 'all', hint: 'Permite edição ampla na área.' };
  }
  if (key.endsWith('.edit.own')) {
    return { scope: 'Editar próprio', tone: 'own', hint: 'Permite edição apenas quando houver vínculo direto.' };
  }
  if (key.endsWith('.fill_week.all')) {
    return { scope: 'Preencher todos', tone: 'all', hint: 'Permite preencher métricas de todos os squads.' };
  }
  if (key.endsWith('.fill_week.own')) {
    return { scope: 'Preencher próprio', tone: 'own', hint: 'Permite preencher métricas apenas do próprio escopo.' };
  }
  if (key.endsWith('.manage') || key === 'team.manage') {
    return { scope: 'Gerenciar', tone: 'admin', hint: 'Permissão administrativa de manutenção.' };
  }
  if (key.endsWith('.create')) {
    return { scope: 'Criar', tone: 'create', hint: 'Permite criar novos registros na área.' };
  }
  if (key === 'audit.view') {
    return { scope: 'Auditoria', tone: 'admin', hint: 'Permite consultar histórico administrativo.' };
  }
  if (key === 'team.view') {
    return { scope: 'Administrativo', tone: 'admin', hint: 'Permite visualizar equipe e acessos.' };
  }
  return { scope: 'Operacional', tone: 'neutral', hint: 'Permissão operacional da área.' };
}

function PermissionScopeBadge({ permission }) {
  const meta = getPermissionMeta(permission);
  return <span className={`${styles.permissionScopeBadge} ${styles[`permissionScopeBadge_${meta.tone}`] || ''}`.trim()}>{meta.scope}</span>;
}

function PermissionText({ permission, showHint = false }) {
  const meta = getPermissionMeta(permission);
  return (
    <span className={styles.permissionText}>
      <strong>{permissionLabel(permission)}</strong>
      {showHint ? <small>{meta.hint}</small> : null}
    </span>
  );
}

function StatCard({ label, value, hint = '', className = '' }) {
  const cardClassName = [styles.metricCard, className].filter(Boolean).join(' ');

  return (
    <article className={cardClassName}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

export default function TeamAccessPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const {
    squads,
    gdvs,
    clients,
    loading,
    error,
    refreshSquads,
    refreshGdvs,
    refreshClients,
    refreshUserDirectory,
    setPanelHeader,
  } = useOutletContext();

  const canViewTeam = hasPermission(user, 'team.view');
  const canManageTeam = hasPermission(user, 'team.manage');
  const canManageSquads = hasPermission(user, 'squads.manage');
  const canManageGdvs = hasPermission(user, 'gdv.manage');
  const canViewAuditTrail = hasPermission(user, 'audit.view');
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'users');
  const [squadModal, setSquadModal] = useState({ open: false, mode: 'create', squad: null });
  const [userModal, setUserModal] = useState({ open: false, mode: 'create', user: null, initialRole: 'gestor' });
  const [userDeleteConfirm, setUserDeleteConfirm] = useState({ open: false, user: null });
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(null);
  const [users, setUsers] = useState([]);
  const [permissionGroups, setPermissionGroups] = useState(PERMISSION_GROUPS);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState(null);
  const [requests, setRequests] = useState([]);
  const [requestReview, setRequestReview] = useState({ open: false, request: null });
  const [lastApprovalResult, setLastApprovalResult] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditFilters, setAuditFilters] = useState({ actions: [], entityTypes: [] });
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [auditEntityFilter, setAuditEntityFilter] = useState('all');
  const loadUsers = async () => {
    if (!canViewTeam) return;
    setUsersLoading(true);
    setUsersError(null);
    try {
      const response = await listUsers();
      setUsers(Array.isArray(response?.users) ? response.users : []);
      setPermissionGroups(Array.isArray(response?.permissionGroups) && response.permissionGroups.length ? response.permissionGroups : PERMISSION_GROUPS);
    } catch (err) {
      setUsersError(err instanceof Error ? err : new Error('Não foi possível carregar os usuários.'));
    } finally {
      setUsersLoading(false);
    }
  };

  const loadRequests = async () => {
    if (!canManageTeam) return;
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const response = await listAccessRequests('all');
      setRequests(Array.isArray(response?.requests) ? response.requests : []);
    } catch (err) {
      setRequestsError(err instanceof Error ? err : new Error('Não foi possível carregar as solicitações.'));
    } finally {
      setRequestsLoading(false);
    }
  };

  const loadAuditLogs = async (overrides = {}) => {
    if (!canViewAuditTrail) return;
    const nextAction = overrides.action ?? auditActionFilter;
    const nextEntityType = overrides.entityType ?? auditEntityFilter;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const [logsResponse, filtersResponse] = await Promise.all([
        listAuditLogs({ action: nextAction, entityType: nextEntityType, limit: 120 }),
        listAuditLogFilters(),
      ]);
      setAuditLogs(Array.isArray(logsResponse?.logs) ? logsResponse.logs : []);
      setAuditFilters({
        actions: Array.isArray(filtersResponse?.actions) ? filtersResponse.actions : [],
        entityTypes: Array.isArray(filtersResponse?.entityTypes) ? filtersResponse.entityTypes : [],
      });
    } catch (err) {
      setAuditError(err instanceof Error ? err : new Error('Não foi possível carregar a auditoria administrativa.'));
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (canViewTeam) loadUsers();
    if (canManageTeam) loadRequests();
    if (canViewAuditTrail) loadAuditLogs({ action: 'all', entityType: 'all' });
  }, [canManageTeam, canViewAuditTrail, canViewTeam]);

  const squadRows = useMemo(() => {
    const squadList = Array.isArray(squads) ? squads : [];
    const clientList = Array.isArray(clients) ? clients : [];
    return squadList
      .map((squad) => {
        const linked = clientList.filter((client) => client?.squadId === squad.id);
        const active = linked.filter((client) => client?.status !== 'churn').length;
        const gestors = new Set(linked.map((client) => client?.gestor).filter(Boolean)).size;
        const owner =
          squad?.owner
          || (squad?.ownerUserId
            ? users.find((entry) => entry?.id === squad.ownerUserId) || null
            : null);
        const ownerUserId = squad?.ownerUserId || owner?.id || '';
        return {
          ...squad,
          clientsCount: linked.length,
          activeClients: active,
          gestors,
          ownerUserId,
          owner,
          operationalStatus: owner ? 'Ativo' : 'Desativado',
        };
      })
      .sort((a, b) => b.clientsCount - a.clientsCount || String(a.name).localeCompare(String(b.name), 'pt-BR'));
  }, [squads, clients, users]);

  const totalClients = Array.isArray(clients) ? clients.length : 0;
  const allocatedClients = Array.isArray(clients) ? clients.filter((client) => client?.squadId).length : 0;
  const unallocatedClients = Math.max(totalClients - allocatedClients, 0);
  const biggestSquad = squadRows[0] || null;

  const userRows = useMemo(() => {
    const squadNameMap = new Map((Array.isArray(squads) ? squads : []).map((item) => [item.id, item.name]));
    return (Array.isArray(users) ? users : [])
      .map((entry) => ({
        ...entry,
        squadNames: (Array.isArray(entry?.squads) ? entry.squads : []).map((id) => squadNameMap.get(id)).filter(Boolean),
      }))
      .sort((a, b) => Number(Boolean(b.isMaster)) - Number(Boolean(a.isMaster)) || String(a.name).localeCompare(String(b.name), 'pt-BR'));
  }, [users, squads]);

  const gdvRows = useMemo(() => {
    const clientList = Array.isArray(clients) ? clients : [];
    return (Array.isArray(gdvs) ? gdvs : [])
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'))
      .map((gdv) => {
        const linked = clientList.filter((client) => String(client?.gdvName || '').trim() === gdv.name);
        const owner = gdv.owner || userRows.find((entry) => entry.id === gdv.ownerUserId) || null;
        return {
          id: gdv.id,
          name: gdv.name,
          clientsCount: linked.length,
          activeClients: linked.filter((client) => client?.status !== 'churn').length,
          ownerId: gdv.ownerUserId || '',
          owner,
          operationalStatus: gdv.active && owner ? 'Ativo' : 'Desativado',
        };
      });
  }, [clients, gdvs, userRows]);

  const gdvsWithOwner = gdvRows.filter((entry) => entry.owner).length;
  const gdvsWithoutOwner = Math.max(gdvRows.length - gdvsWithOwner, 0);
  const gdvLinkedClients = gdvRows.reduce((total, entry) => total + entry.clientsCount, 0);

  const filteredUserRows = useMemo(() => {
    const term = userSearch.trim();
    return userRows.filter((entry) => {
      const matchesTerm = !term || matchesAnySearch([entry.name, entry.email], term);
      const effectiveRole = entry.isMaster ? 'admin' : entry.role;
      const matchesRole = userRoleFilter === 'all' || effectiveRole === userRoleFilter || userHasRole(entry, userRoleFilter);
      const matchesStatus = userStatusFilter === 'all' || (userStatusFilter === 'active' ? entry.active : !entry.active);
      return matchesTerm && matchesRole && matchesStatus;
    });
  }, [userRows, userSearch, userRoleFilter, userStatusFilter]);

  const activeUsers = userRows.filter((entry) => entry.active).length;
  const adminsCount = userRows.filter((entry) => entry.role === 'admin' || entry.isMaster).length;
  const gdvCount = userRows.filter((entry) => userHasRole(entry, 'gdv')).length;
  const inactiveUsers = userRows.length - activeUsers;
  const unrestrictedUsers = userRows.filter((entry) => !entry.squadNames.length).length;
  const restrictedUsers = userRows.length - unrestrictedUsers;
  const activeAdmins = userRows.filter((entry) => entry.active && (['admin', 'ceo', 'suporte_tecnologia'].includes(entry.role) || entry.isMaster)).length;

  const requestRows = useMemo(
    () => (Array.isArray(requests) ? requests : []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [requests]
  );
  const pendingRequests = requestRows.filter((entry) => entry.status === 'pending').length;
  const approvedRequests = requestRows.filter((entry) => entry.status === 'approved').length;
  const rejectedRequests = requestRows.filter((entry) => entry.status === 'rejected').length;

  const roleSummaries = useMemo(() => {
    return ROLE_ORDER.map((role) => {
      const summary = getRoleSummary(role);
      const usersCount = userRows.filter((entry) => userHasRole(entry, role)).length;
      const activeCount = userRows.filter((entry) => userHasRole(entry, role) && entry.active).length;
      return { ...summary, usersCount, activeCount };
    });
  }, [userRows]);

  const matrixPermissions = useMemo(() => permissionGroups.flatMap((group) => group.permissions), [permissionGroups]);

  const accessibleTabs = useMemo(() => {
    const tabs = [];
    if (canManageTeam) tabs.push('requests');
    if (canViewTeam) tabs.push('users', 'squads', 'gdvs', 'roles');
    if (canViewAuditTrail) tabs.push('audit');
    return tabs;
  }, [canManageTeam, canViewAuditTrail, canViewTeam]);

  useEffect(() => {
    if (!accessibleTabs.length) return;

    const tabFromUrl = searchParams.get('tab');

    if (tabFromUrl && accessibleTabs.includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
      return;
    }

    if (!accessibleTabs.includes(activeTab)) {
      const fallbackTab = accessibleTabs[0];
      setActiveTab(fallbackTab);
      setSearchParams((params) => {
        const next = new URLSearchParams(params);
        next.set('tab', fallbackTab);
        return next;
      }, { replace: true });
      return;
    }

    if (!tabFromUrl) {
      setSearchParams((params) => {
        const next = new URLSearchParams(params);
        next.set('tab', activeTab);
        return next;
      }, { replace: true });
    }
  }, [accessibleTabs, activeTab, searchParams, setSearchParams]);

  function handleTabChange(tab) {
    setActiveTab(tab);
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set('tab', tab);
      return next;
    });
  }

  useEffect(() => {
    const title = (
      <>
        <strong>Equipe &amp; Acessos</strong>
        <span>·</span>
        <span>
          {activeTab === 'squads'
            ? `${squadRows.length} squads estruturados`
            : activeTab === 'users'
              ? `${filteredUserRows.length} usuários visíveis`
              : activeTab === 'gdvs'
                ? `${gdvRows.length} GDVs configurados`
                : activeTab === 'roles'
                ? `${roleSummaries.length} cargos mapeados`
                : activeTab === 'requests'
                  ? `${pendingRequests} solicitações pendentes`
                  : `${auditLogs.length} eventos de auditoria`}
        </span>
      </>
    );

    const actions = (() => {
      if (activeTab === 'requests' && canManageTeam) {
        return <div className={styles.headerActions}><button type="button" className={styles.ghostButton} onClick={loadRequests}>Atualizar solicitações</button></div>;
      }
      if (activeTab === 'users' && canManageTeam) {
        return (
          <div className={styles.headerActions}>
            <button type="button" className={styles.headerBtn} onClick={() => setUserModal({ open: true, mode: 'create', user: null, initialRole: 'gestor' })}>
              <PlusIcon size={14} />
              <span>Novo usuário</span>
            </button>
          </div>
        );
      }
      if (activeTab === 'squads' && canManageSquads) {
        return (
          <div className={styles.headerActions}>
            <button type="button" className={styles.headerBtn} onClick={() => setSquadModal({ open: true, mode: 'create', squad: null })}>
              <PlusIcon size={14} />
              <span>Novo squad</span>
            </button>
          </div>
        );
      }
      if (activeTab === 'gdvs' && canManageGdvs) {
        return (
          <div className={styles.headerActions}>
            <button type="button" className={styles.headerBtn} onClick={() => setUserModal({ open: true, mode: 'create', user: null, initialRole: 'gdv' })}>
              <PlusIcon size={14} />
              <span>Novo GDV</span>
            </button>
          </div>
        );
      }
      if (activeTab === 'roles' && canViewTeam) {
        return <div className={styles.headerActions}><button type="button" className={styles.ghostButton} onClick={loadUsers}>Atualizar matriz</button></div>;
      }
      if (activeTab === 'audit' && canViewAuditTrail) {
        return <div className={styles.headerActions}><button type="button" className={styles.ghostButton} onClick={() => loadAuditLogs()}>Atualizar trilha</button></div>;
      }
      return null;
    })();

    setPanelHeader({ title, actions });
  }, [activeTab, canManageGdvs, canManageSquads, canManageTeam, canViewAuditTrail, canViewTeam, squadRows.length, filteredUserRows.length, gdvRows.length, pendingRequests, auditLogs.length, roleSummaries.length, setPanelHeader]);

  async function handleSquadSubmit(payload) {
    if (!canManageSquads) return;
    const safeName = String(payload?.name || '').trim();
    const ownerUserId = payload?.ownerUserId || '';
    const active = Boolean(ownerUserId);
    const logoUrl = typeof payload?.logoUrl === 'string' ? payload.logoUrl : '';
    setSubmitting(true);
    try {
      if (squadModal.mode === 'create') {
        await createSquad({ name: safeName, ownerUserId, active, logoUrl });
        showToast(`"${safeName}" criado com sucesso.`);
      } else if (squadModal.squad?.id) {
        await updateSquad(squadModal.squad.id, { name: safeName, ownerUserId, active, logoUrl });
        showToast(`"${safeName}" atualizado com sucesso.`);
      }
      setSquadModal({ open: false, mode: 'create', squad: null });
      await refreshSquads?.();
    } catch (err) {
      showToast(err?.message || 'Não foi possível salvar o squad.', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUserSubmit(form) {
    if (!canManageTeam) return;
    setSubmitting(true);
    try {
      if (userModal.mode === 'create') {
        const response = await createUser(form);
        const createdUser = response?.user || response;
        if (form.role === 'gdv' && form.name?.trim() && createdUser?.id) {
          await createGdv({ name: form.name.trim(), ownerUserId: createdUser.id });
        }
        showToast(`"${form.name.trim()}" criado com sucesso.`);
      } else if (userModal.user?.id) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await updateUser(userModal.user.id, payload);
        showToast(`"${form.name.trim()}" atualizado com sucesso.`);
      }
      setUserModal({ open: false, mode: 'create', user: null, initialRole: 'gestor' });
      await loadUsers();
      await Promise.all([refreshUserDirectory?.(), refreshGdvs?.()]);
    } catch (err) {
      showToast(err?.message || 'Não foi possível salvar o usuário.', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteSquad(squad) {
    if (!canManageSquads || !squad?.id) return;
    setDeleteId(squad.id);
    try {
      await deleteSquad(squad.id);
      showToast(`"${squad.name}" removido.`);
      setSquadModal((prev) => (prev?.squad?.id === squad.id ? { open: false, mode: 'create', squad: null } : prev));
      await Promise.all([refreshSquads?.(), refreshClients?.()]);
    } catch (err) {
      showToast(err?.message || 'Não foi possível remover o squad.', { variant: 'error' });
    } finally {
      setDeleteId(null);
    }
  }

  async function handleToggleUser(target) {
    if (!canManageTeam || !target?.id) return;
    setDeleteId(target.id);
    try {
      const response = await toggleUserActive(target.id);
      showToast(`${response?.user?.active ? 'Usuário reativado' : 'Usuário desativado'} com sucesso.`);
      await loadUsers();
    } catch (err) {
      showToast(err?.message || 'Não foi possível atualizar o status do usuário.', { variant: 'error' });
    } finally {
      setDeleteId(null);
    }
  }

  async function handleDeleteUser(target) {
    if (!canManageTeam || !target?.id) return;
    setDeleteId(target.id);
    try {
      await deleteUser(target.id);
      showToast(`"${target.name}" removido.`);
      setUserDeleteConfirm({ open: false, user: null });
      await loadUsers();
    } catch (err) {
      showToast(err?.message || 'Não foi possível remover o usuário.', { variant: 'error' });
    } finally {
      setDeleteId(null);
    }
  }

  async function handleResetUserPassword(target) {
    if (!canManageTeam || !target?.id) return;
    setDeleteId(target.id);
    try {
      const response = await resetUserPassword(target.id);
      setLastApprovalResult({
        kind: 'manual-reset',
        updatedUser: response?.user || target,
        temporaryPassword: response?.temporaryPassword || '',
      });
      showToast(`Senha temporária gerada para ${target.name}.`);
      await loadUsers();
    } catch (err) {
      showToast(err?.message || 'Não foi possível gerar a senha temporária.', { variant: 'error' });
    } finally {
      setDeleteId(null);
    }
  }

  async function handleRequestStatus(target, payload) {
    if (!canManageTeam) return;
    try {
      setSubmitting(true);
      const response = await updateAccessRequest(target.id, payload);
      const result = response?.approvalResult || null;
      setLastApprovalResult(result);
      setRequestReview({ open: false, request: null });
      showToast(`Solicitação ${payload.status === 'approved' ? 'aprovada' : 'rejeitada'} com sucesso.`);
      await Promise.all([loadRequests(), loadUsers()]);
    } catch (err) {
      showToast(err?.message || 'Não foi possível atualizar a solicitação.', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  if (!accessibleTabs.length) {
    return (
      <div className={styles.page}>
        <StateBlock
          variant="empty"
          title="Acesso não autorizado"
          description="Seu usuário não possui permissões para visualizar esta área."
        />
      </div>
    );
  }

  if (loading && squadRows.length === 0) {
    return (
      <div className={styles.page}>
        <StateBlock
          variant="loading"
          title="Carregando administração"
          description="Buscando squads, usuários e governança do ambiente."
        />
      </div>
    );
  }

  if (error && squadRows.length === 0) {
    return (
      <div className={styles.page}>
        <StateBlock
          variant="error"
          title="Erro ao carregar administração"
          description={error.message || 'Não foi possível carregar a gestão de equipes neste momento.'}
          action={
            <button type="button" className={styles.inlineRetry} onClick={() => refreshSquads?.()}>
              Tentar novamente
            </button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className={styles.page}>
        <div className={styles.tabBar}>
          {canManageTeam ? (
            <button
              type="button"
              className={`${styles.tabButton} ${activeTab === 'requests' ? styles.tabButtonActive : ''}`}
              onClick={() => handleTabChange('requests')}
            >
              <MailIcon size={14} />
              <span>Solicitações</span>
            </button>
          ) : null}
          {canViewTeam ? (
            <>
              <button type="button" className={`${styles.tabButton} ${activeTab === 'users' ? styles.tabButtonActive : ''}`} onClick={() => handleTabChange('users')}>
                <ShieldIcon size={14} />
                <span>Usuários &amp; acessos</span>
              </button>
              <button type="button" className={`${styles.tabButton} ${activeTab === 'squads' ? styles.tabButtonActive : ''}`} onClick={() => handleTabChange('squads')}>
                <BuildingIcon size={14} />
                <span>Squads</span>
              </button>
              <button type="button" className={`${styles.tabButton} ${activeTab === 'gdvs' ? styles.tabButtonActive : ''}`} onClick={() => handleTabChange('gdvs')}>
                <UsersIcon size={14} />
                <span>GDVs</span>
              </button>
              <button type="button" className={`${styles.tabButton} ${activeTab === 'roles' ? styles.tabButtonActive : ''}`} onClick={() => handleTabChange('roles')}>
                <ShieldIcon size={14} />
                <span>Cargos &amp; permissões</span>
              </button>
            </>
          ) : null}
          {canViewAuditTrail ? (
            <button type="button" className={`${styles.tabButton} ${activeTab === 'audit' ? styles.tabButtonActive : ''}`} onClick={() => handleTabChange('audit')}>
              <ShieldIcon size={14} />
              <span>Auditoria</span>
            </button>
          ) : null}
        </div>

        <div className={styles.tabContent}>
          {activeTab === 'squads' ? (
          <>
            <section className={styles.metricGrid}>
              <StatCard label="Total de squads" value={squadRows.length} hint="estrutura cadastrada" />
              <StatCard label="Clientes alocados" value={allocatedClients} hint="já vinculados a squad" />
              <StatCard label="Clientes sem squad" value={unallocatedClients} hint="" />
              <StatCard label="Maior carteira" value={biggestSquad?.clientsCount || 0} hint={biggestSquad?.name || '—'} />
            </section>

            <section className={styles.tableCard}>
              <div className={styles.sectionHead}>
                <div>
                  <span className={styles.sectionEyebrow}>Estrutura atual</span>
                  <h3>Squads cadastrados</h3>
                </div>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Squad</th>
                      <th>Clientes</th>
                      <th>Status</th>
                      <th>Gestores</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {squadRows.map((squad) => (
                      <tr key={squad.id}>
                        <td>
                          <div className={styles.primaryCell}>
                            <div className={styles.squareIcon}><BuildingIcon size={16} /></div>
                            <div>
                              <strong>{squad.name}</strong>
                              <small>
                                {squad.owner?.name
                                  ? (
                                    <>
                                      proprietário:{' '}
                                      <Link to={`/perfil/${encodeURIComponent(squad.owner.id)}`} className={styles.inlineProfileLink}>
                                        {squad.owner.name}
                                      </Link>
                                    </>
                                  )
                                  : squad.createdAt
                                    ? `criado em ${new Date(squad.createdAt).toLocaleDateString('pt-BR')}`
                                    : 'estrutura ativa'}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>{squad.clientsCount}</td>
                        <td>
                          <span className={`${styles.statusPill} ${squad.owner ? styles.statusPillActive : styles.statusPillMuted}`}>
                            {squad.operationalStatus}
                          </span>
                        </td>
                        <td>{squad.gestors}</td>
                        <td>
                          <div className={styles.rowActions}>
                            <Link to={`/squads/${encodeURIComponent(squad.id)}`} className={styles.dashboardLink}>Abrir dashboard</Link>
                            {canManageSquads ? (
                              <>
                                <button type="button" className={styles.ghostButton} onClick={() => setSquadModal({ open: true, mode: 'edit', squad })}>Editar</button>
                                <button type="button" className={styles.dangerButton} disabled={deleteId === squad.id} onClick={() => handleDeleteSquad(squad)}>
                                  {deleteId === squad.id ? 'Removendo...' : 'Excluir'}
                                </button>
                              </>
                            ) : <span className={styles.dimText}>Somente leitura</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {squadRows.length === 0 ? (
                      <tr><td colSpan="5"><div className={styles.tableEmpty}>Nenhum squad cadastrado.</div></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : activeTab === 'users' ? (
          <>
            <section className={styles.metricGrid}>
              <StatCard label="Usuários ativos" value={activeUsers} />
              <StatCard label="Admins ativos" value={activeAdmins} />
              <StatCard label="Escopo por squad" value={restrictedUsers} />
              <StatCard label="Acesso amplo" value={unrestrictedUsers} />
            </section>
            {usersError && userRows.length === 0 ? (
              <StateBlock
                variant="error"
                title="Erro ao carregar usuários"
                description={usersError.message || 'Não foi possível carregar a gestão de usuários.'}
                action={<button type="button" className={styles.inlineRetry} onClick={loadUsers}>Tentar novamente</button>}
              />
            ) : null}

            <section className={styles.tableCard}>
              <div className={styles.sectionHead}>
                <div>
                  <span className={styles.sectionEyebrow}>Acessos internos</span>
                  <h3>Usuários da plataforma</h3>
                </div>
              </div>

              <div className={styles.filterBar}>
                <label className={styles.filterField}>
                  <span>Buscar</span>
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Nome ou e-mail"
                  />
                </label>
                <label className={styles.filterField}>
                  <span>Papel</span>
                  <Select value={userRoleFilter} onChange={(event) => setUserRoleFilter(event.target.value)} aria-label="Filtrar por papel">
                    <option value="all">Todos</option>
                    <option value="ceo">CEO</option>
                    <option value="suporte_tecnologia">Suporte de tecnologia (TI)</option>
                    <option value="admin">Administrador legado</option>
                    <option value="gdv">GDV</option>
                    <option value="gestor">Gestor de Tráfego</option>
                    <option value="cap">CAP</option>
                  </Select>
                </label>
                <label className={styles.filterField}>
                  <span>Status</span>
                  <Select value={userStatusFilter} onChange={(event) => setUserStatusFilter(event.target.value)} aria-label="Filtrar por status de usuário">
                    <option value="all">Todos</option>
                    <option value="active">Ativos</option>
                    <option value="inactive">Inativos</option>
                  </Select>
                </label>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Usuário</th>
                      <th>Papel</th>
                      <th>Squads</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersLoading && filteredUserRows.length === 0 ? (
                      <tr><td colSpan="5"><StateBlock compact variant="loading" title="Carregando usuários" /></td></tr>
                    ) : null}
                    {!usersLoading && filteredUserRows.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <div className={styles.primaryCell}>
                            <div className={styles.squareIcon}><ShieldIcon size={16} /></div>
                            <div>
                              <strong>
                                <Link to={`/perfil/${encodeURIComponent(entry.id)}`} className={styles.inlineProfileLink}>
                                  {entry.name}
                                </Link>
                              </strong>
                              <small>{entry.email}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={styles.roleStack}>
                            <span className={styles.rolePill}>{entry.isMaster ? 'Suporte de tecnologia (TI)' : roleLabel(entry.role)}</span>
                            {effectiveRoleLabels(entry).slice(1).map((label) => (
                              <span key={label} className={styles.secondaryRolePill}>{label}</span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className={styles.squadPills}>
                            {entry.squadNames.length > 0 ? entry.squadNames.slice(0, 3).map((name) => (
                              <span key={name} className={styles.squadPill}>{name}</span>
                            )) : <span className={styles.dimText}>Todos / sem restrição</span>}
                            {entry.squadNames.length > 3 ? <span className={styles.dimText}>+{entry.squadNames.length - 3}</span> : null}
                          </div>
                        </td>
                        <td><span className={`${styles.statusPill} ${entry.active ? styles.statusPillActive : styles.statusPillMuted}`}>{entry.active ? 'Ativo' : 'Inativo'}</span></td>
                        <td>
                          <div className={styles.rowActions}>
                            {canManageTeam ? (
                              <>
                                <button type="button" className={styles.ghostButton} onClick={() => setUserModal({ open: true, mode: 'edit', user: entry })}>Editar</button>
                                <button type="button" className={styles.dashboardLink} disabled={Boolean(entry.isMaster) || deleteId === entry.id} onClick={() => handleResetUserPassword(entry)}>
                                  {deleteId === entry.id ? 'Gerando...' : 'Gerar senha'}
                                </button>
                                <button type="button" className={styles.dashboardLink} disabled={Boolean(entry.isMaster) || deleteId === entry.id} onClick={() => handleToggleUser(entry)}>
                                  {deleteId === entry.id ? 'Salvando...' : entry.active ? 'Desativar' : 'Reativar'}
                                </button>
                                <button type="button" className={styles.dangerButton} disabled={Boolean(entry.isMaster) || deleteId === entry.id} onClick={() => setUserDeleteConfirm({ open: true, user: entry })}>
                                  {deleteId === entry.id ? 'Removendo...' : 'Excluir'}
                                </button>
                              </>
                            ) : <span className={styles.dimText}>Somente leitura</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!usersLoading && filteredUserRows.length === 0 ? (
                      <tr><td colSpan="5"><div className={styles.tableEmpty}>Nenhum usuário encontrado.</div></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : activeTab === 'gdvs' ? (
          <>
            <section className={styles.gdvAdminMetricGrid}>
              <StatCard className={styles.gdvAdminMetricCard} label="GDVs mapeados" value={gdvRows.length} hint="carteiras operacionais" />
              <StatCard className={styles.gdvAdminMetricCard} label="Com proprietário" value={gdvsWithOwner} hint="ativos para operação" />
              <StatCard className={styles.gdvAdminMetricCard} label="Sem proprietário" value={gdvsWithoutOwner} hint="" />
              <StatCard className={styles.gdvAdminMetricCard} label="Clientes vinculados" value={gdvLinkedClients} hint="base com GDV definido" />
            </section>

            <section className={`${styles.tableCard} ${styles.gdvAdminTable}`}>
              <div className={styles.sectionHead}>
                <div>
                  <span className={styles.sectionEyebrow}>Governança GDV</span>
                  <h3>Proprietários por carteira</h3>
                </div>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>GDV</th>
                      <th>Clientes</th>
                      <th>Proprietário</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gdvRows.map((entry) => (
                      <tr key={entry.name}>
                        <td>
                          <div className={styles.primaryCell}>
                            <div className={styles.squareIcon}><UsersIcon size={16} /></div>
                            <div>
                              <strong>{entry.name}</strong>
                              <small>{entry.activeClients} ativos na carteira</small>
                            </div>
                          </div>
                        </td>
                        <td>{entry.clientsCount}</td>
                        <td>
                          {canManageGdvs ? (
                            <UserPicker
                              className={`${styles.ownerInlineSelect} ${styles.gdvOwnerSelect}`}
                              users={userRows.filter((item) => item.active)}
                              value={entry.ownerId}
                              onChange={async (userId) => {
                                await updateGdv(entry.id, { name: entry.name, ownerUserId: userId });
                                await refreshGdvs?.();
                              }}
                              placeholder="Sem proprietário"
                              showRole
                              portal
                              disableHover
                            />
                          ) : entry.owner ? (
                            <Link to={`/perfil/${encodeURIComponent(entry.owner.id)}`} className={styles.inlineProfileLink}>
                              {entry.owner.name}
                            </Link>
                          ) : (
                            <span className={styles.dimText}>Sem proprietário</span>
                          )}
                        </td>
                        <td>
                          <span className={`${styles.statusPill} ${entry.owner ? styles.statusPillActive : styles.statusPillMuted}`}>
                            {entry.operationalStatus}
                          </span>
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            <Link to={`/gdv?gdv=${encodeURIComponent(entry.name)}`} className={styles.dashboardLink}>Abrir GDV</Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {gdvRows.length === 0 ? (
                      <tr><td colSpan="5"><div className={styles.tableEmpty}>Nenhum GDV encontrado.</div></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : activeTab === 'roles' ? (
          <>
            <section className={`${styles.tableCard} ${styles.rolesMatrixCard}`}>
              <div className={styles.sectionHead}>
                <div>
                  <span className={styles.sectionEyebrow}>Matriz de permissão</span>
                  <h3>Áreas x cargos</h3>
                </div>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Permissão</th>
                      <th>Escopo</th>
                      {roleSummaries.map((item) => (
                        <th key={item.role}>{item.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {permissionGroups.map((group) => (
                      group.permissions.map((permission, index) => (
                        <tr key={permission}>
                          <td>
                            <div className={styles.primaryCell}>
                              <ShieldIcon size={15} />
                              <div>
                                <strong>{permissionLabel(permission)}</strong>
                                <small>{index === 0 ? group.area : 'Permissão operacional'}</small>
                              </div>
                            </div>
                          </td>
                          <td><PermissionScopeBadge permission={permission} /></td>
                          {roleSummaries.map((item) => {
                            const allowed = item.isWildcard || item.permissions.includes(permission);
                            return (
                              <td key={`${permission}-${item.role}`}>
                                <span className={`${styles.matrixPill} ${allowed ? styles.matrixPillOn : styles.matrixPillOff}`}>
                                  {allowed ? 'Incluído' : '—'}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : activeTab === 'requests' ? (
          <>
            <section className={styles.metricGrid}>
              <StatCard label="Pendentes" value={pendingRequests} hint="aguardam triagem" />
              <StatCard label="Aprovadas" value={approvedRequests} hint="já tratadas" />
              <StatCard label="Rejeitadas" value={rejectedRequests} hint="encerradas" />
              <StatCard label="Volume total" value={requestRows.length} hint="histórico recente" />
            </section>

            {lastApprovalResult ? (
              <section className={styles.resultBanner}>
                <div>
                  <span className={styles.sectionEyebrow}>Resultado da última aprovação</span>
                  <h3>
                    {lastApprovalResult.kind === 'invite' ? 'Usuário provisionado com sucesso' : 'Senha temporária gerada com sucesso'}
                  </h3>
                  <p>
                    {lastApprovalResult.kind === 'invite'
                      ? `Usuário criado para ${lastApprovalResult.createdUser?.email || 'conta aprovada'}.`
                      : `Nova senha temporária gerada para ${lastApprovalResult.updatedUser?.email || 'usuário selecionado'}.`}
                  </p>
                </div>
                <div className={styles.resultMeta}>
                  <div className={styles.resultCreds}>
                    <span>Senha temporária</span>
                    <strong>{lastApprovalResult.temporaryPassword}</strong>
                  </div>
                  <button type="button" className={styles.ghostButton} onClick={() => setLastApprovalResult(null)}>
                    Ocultar
                  </button>
                </div>
              </section>
            ) : null}

            {requestsError && requestRows.length === 0 ? (
              <StateBlock
                variant="error"
                title="Erro ao carregar solicitações"
                description={requestsError.message || 'Não foi possível carregar as solicitações de acesso.'}
                action={<button type="button" className={styles.inlineRetry} onClick={loadRequests}>Tentar novamente</button>}
              />
            ) : null}

            <section className={styles.tableCard}>
              <div className={styles.sectionHead}>
                <div>
                  <span className={styles.sectionEyebrow}>Solicitações externas</span>
                  <h3>Convites e redefinições</h3>
                </div>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Solicitação</th>
                      <th>Contato</th>
                      <th>Status</th>
                      <th>Observações</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestsLoading && requestRows.length === 0 ? (
                      <tr><td colSpan="5"><StateBlock compact variant="loading" title="Carregando solicitações" /></td></tr>
                    ) : null}
                    {!requestsLoading && requestRows.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <div className={styles.primaryCell}>
                            <div className={styles.squareIcon}><MailIcon size={16} /></div>
                            <div>
                              <strong>{entry.type === 'invite' ? 'Convite de acesso' : 'Redefinição de senha'}</strong>
                              <small>{new Date(entry.createdAt).toLocaleString('pt-BR')}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={styles.textStack}>
                            <strong>{entry.requesterName || entry.requesterIdentifier || 'Solicitante'}</strong>
                            <small className={styles.dimText}>{entry.requesterEmail || entry.company || 'sem e-mail informado'}</small>
                          </div>
                        </td>
                        <td>
                          <span className={`${styles.statusPill} ${entry.status === 'approved' ? styles.statusPillActive : entry.status === 'rejected' ? styles.statusPillMuted : styles.rolePill}`}>
                            {entry.status === 'pending' ? 'Pendente' : entry.status === 'approved' ? 'Aprovada' : 'Rejeitada'}
                          </span>
                        </td>
                        <td>{entry.note || '—'}</td>
                        <td>
                          <div className={styles.rowActions}>
                            {entry.status === 'pending' ? (
                              <>
                                <button type="button" className={styles.dashboardLink} onClick={() => setRequestReview({ open: true, request: entry })}>Analisar</button>
                                <button type="button" className={styles.dangerButton} onClick={() => setRequestReview({ open: true, request: entry, forceReject: true })}>Rejeitar</button>
                              </>
                            ) : (
                              <span className={styles.dimText}>Processada</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!requestsLoading && requestRows.length === 0 ? (
                      <tr><td colSpan="5"><div className={styles.tableEmpty}>Nenhuma solicitação registrada ainda.</div></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className={styles.metricGrid}>
              <StatCard label="Eventos" value={auditLogs.length} hint="retorno mais recente" />
              <StatCard label="Ações" value={auditFilters.actions.length} hint="tipos registrados" />
              <StatCard label="Entidades" value={auditFilters.entityTypes.length} hint="domínios monitorados" />
              <StatCard label="Governança" value="ativa" hint="trilha administrativa" />
            </section>

            <section className={styles.tableCard}>
              <div className={styles.sectionHead}>
                <div>
                  <span className={styles.sectionEyebrow}>Trilha administrativa</span>
                  <h3>Auditoria de ações críticas</h3>
                </div>
              </div>

              <div className={styles.filterBar}>
                <label className={styles.filterField}>
                  <span>Ação</span>
                  <Select
                    value={auditActionFilter}
                    onChange={async (event) => {
                      const value = event.target.value;
                      setAuditActionFilter(value);
                      await loadAuditLogs({ action: value, entityType: auditEntityFilter });
                    }}
                    aria-label="Filtrar auditoria por ação"
                  >
                    <option value="all">Todas</option>
                    {auditFilters.actions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </Select>
                </label>
                <label className={styles.filterField}>
                  <span>Entidade</span>
                  <Select
                    value={auditEntityFilter}
                    onChange={async (event) => {
                      const value = event.target.value;
                      setAuditEntityFilter(value);
                      await loadAuditLogs({ action: auditActionFilter, entityType: value });
                    }}
                    aria-label="Filtrar auditoria por entidade"
                  >
                    <option value="all">Todas</option>
                    {auditFilters.entityTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                  </Select>
                </label>
                <div className={styles.filterField}>
                  <span>Atualização</span>
                  <button type="button" className={styles.ghostButton} onClick={() => loadAuditLogs()}>
                    Atualizar trilha
                  </button>
                </div>
              </div>

              {auditError && auditLogs.length === 0 ? (
                <StateBlock
                  variant="error"
                  title="Erro ao carregar auditoria"
                  description={auditError.message || 'Não foi possível carregar a trilha de ações administrativas.'}
                  action={<button type="button" className={styles.inlineRetry} onClick={() => loadAuditLogs()}>Tentar novamente</button>}
                />
              ) : null}

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Ação</th>
                      <th>Entidade</th>
                      <th>Responsável</th>
                      <th>Resumo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLoading && auditLogs.length === 0 ? (
                      <tr><td colSpan="5"><StateBlock compact variant="loading" title="Carregando auditoria" /></td></tr>
                    ) : null}
                    {!auditLoading && auditLogs.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.createdAt ? new Date(entry.createdAt).toLocaleString('pt-BR') : '—'}</td>
                        <td><span className={styles.rolePill}>{entry.action}</span></td>
                        <td>
                          <div className={styles.primaryCell}>
                            <div className={styles.squareIcon}><ShieldIcon size={16} /></div>
                            <div>
                              <strong>{entry.entityLabel || entry.entityType}</strong>
                              <small>{entry.entityType}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={styles.textStack}>
                            <strong>{entry.actorName || 'Sistema'}</strong>
                            <small>{entry.actorEmail || 'ação interna'}</small>
                          </div>
                        </td>
                        <td>{entry.summary || '—'}</td>
                      </tr>
                    ))}
                    {!auditLoading && auditLogs.length === 0 ? (
                      <tr><td colSpan="5"><div className={styles.tableEmpty}>Nenhum evento encontrado.</div></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
        </div>
      </div>

      {squadModal.open ? (
        <SquadOwnerFormModal
          mode={squadModal.mode}
          squad={squadModal.squad}
          users={userRows.filter((entry) => entry.active)}
          canEditOwner={canManageSquads}
          busy={submitting}
          deleting={deleteId === squadModal.squad?.id}
          onClose={() => setSquadModal({ open: false, mode: 'create', squad: null })}
          onSubmit={handleSquadSubmit}
          onDelete={handleDeleteSquad}
        />
      ) : null}

      {userModal.open ? (
        <UserFormModal
          mode={userModal.mode}
          user={userModal.user}
          squads={Array.isArray(squads) ? squads : []}
          busy={submitting}
          permissionGroups={permissionGroups}
          onClose={() => setUserModal({ open: false, mode: 'create', user: null })}
          onSubmit={handleUserSubmit}
        />
      ) : null}

      {userDeleteConfirm.open && userDeleteConfirm.user ? (
        <ConfirmDeleteUserModal
          user={userDeleteConfirm.user}
          busy={deleteId === userDeleteConfirm.user.id}
          onClose={() => setUserDeleteConfirm({ open: false, user: null })}
          onConfirm={handleDeleteUser}
        />
      ) : null}

      {requestReview.open && requestReview.request ? (
        <RequestReviewModal
          request={requestReview.request}
          squads={Array.isArray(squads) ? squads : []}
          busy={submitting}
          onClose={() => setRequestReview({ open: false, request: null })}
          onSubmit={(payload) => handleRequestStatus(requestReview.request, payload)}
        />
      ) : null}
    </>
  );
}



