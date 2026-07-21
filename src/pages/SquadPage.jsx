import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { updateSquad } from '../api/squads.js';
import { createRouteMeeting, deleteRouteMeeting, listRouteMeetings, updateRouteMeeting } from '../api/routeMeetings.js';
import { getMetric } from '../api/metrics.js';
import { ApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  CalendarIcon,
  CloseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  Select,
  StateBlock,
  SettingsIcon,
  TrophyIcon,
  UsersIcon,
} from '../components/ui/index.js';
import { canAccessSquad, hasPermission } from '../utils/permissions.js';
import { resolveClientFeeAtMonthEnd } from '../utils/feeSchedule.js';
import { MONTHS, fmtInt, fmtMoney, fmtPct } from '../utils/format.js';
import { resolveSquadOwner, subscribeOwnershipChange } from '../utils/ownershipStorage.js';
import {
  aggregateCarteira,
  applyWeeklyGoal,
  buildPeriodKey,
  calcWeek,
  currentWeek,
  effectiveWeeklyGoal,
} from '../utils/gdvMetrics.js';
import {
  getSquadAvatar,
  getSquadCover,
  readAvatarFile,
  readCoverFile,
  removeSquadAvatar,
  saveSquadAvatar,
  subscribeAvatarChange,
} from '../utils/avatarStorage.js';
import { matchesAnySearch } from '../utils/search.js';
import { CLIENT_STATUS, isActiveClientStatus } from '../utils/clientStatus.js';
import { getClientOnboardingDays, onboardingDaysLabel, onboardingDaysTone } from '../utils/clientHelpers.js';
import UserPicker from '../components/users/UserPicker.jsx';
import { buildSquadPath, matchesEntityRouteSegment, slugifySegment } from '../utils/entityPaths.js';
import { TrashIcon } from '../components/ui/Icons.jsx';
import styles from './SquadPage.module.css';
import ClientName from '../components/clients/ClientName.jsx';

const PAGE_SIZE = 10;
const WEEKS_IN_MONTH = [1, 2, 3, 4];


function squadInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'SQ';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function displayInt(value) {
  const numeric = Number(value) || 0;
  return numeric === 0 ? '0' : fmtInt(numeric);
}

function displayPct(value) {
  const numeric = Number(value) || 0;
  return numeric === 0 ? '0%' : fmtPct(numeric);
}

function toneClass(stylesMap, tone) {
  return tone && stylesMap[tone] ? stylesMap[tone] : '';
}

function statusVisualClass(statusText) {
  if (statusText === 'Meta batida') return styles.profitGoal;
  if (statusText === 'Meta lucro') return styles.profitGoal;
  if (statusText === 'Meta lucro batida') return styles.profitGoal;
  if (statusText === 'Vai bater') return styles.willHitGoal;
  if (statusText === 'Vai bater meta lucro') return styles.willHitGoal;
  return '';
}

function effectiveForecast(closed, predicted) {
  return Math.max(Number(closed) || 0, Number(predicted) || 0);
}

function monthlyGoalTarget(calc = {}) {
  return Number(calc?.monthlyGoal) || 0;
}

function weeklyGoalTarget(calc = {}) {
  return Number(calc?.weeklyGoal ?? calc?.mLuc) || 0;
}

function hasHitEffectiveGoal(calc = {}) {
  const weeklyGoal = weeklyGoalTarget(calc);
  const closed = Number(calc?.fec) || 0;
  return weeklyGoal > 0 && closed >= weeklyGoal;
}

function parseClientPeriodDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isClientAvailableForPeriod(client, year, month0) {
  if (!client) return false;

  const end = new Date(year, month0 + 1, 0, 23, 59, 59, 999);
  const start = parseClientPeriodDate(
    client.startDate || client.start_date || client.createdAt || client.created_at
  );
  const churn = parseClientPeriodDate(client.churnDate || client.churn_date);

  if (start && start > end) return false;
  if (churn && churn <= end) return false;
  return true;
}

function isPortfolioStatus(status) {
  return (
    isActiveClientStatus(status) ||
    status === CLIENT_STATUS.ONBOARDING ||
    status === CLIENT_STATUS.RAMPAGE
  );
}

function hasInternalCommercial(client) {
  return Boolean(client?.internalCommercial) && Boolean(String(client?.internalSeller || '').trim());
}

function statusTone(calc, status) {
  if (status === CLIENT_STATUS.CHURN) return 'red';
  if (status === CLIENT_STATUS.ONBOARDING) return 'onboarding';
  if (status === CLIENT_STATUS.RAMPAGE) return 'rampage';
  if (!isActiveClientStatus(status)) return 'muted';

  const weeklyGoal = weeklyGoalTarget(calc);
  const monthlyGoal = monthlyGoalTarget(calc);
  const goal = weeklyGoal || monthlyGoal;
  if (!goal) return 'muted';

  const closed = Number(calc?.fec) || 0;
  const projected = effectiveForecast(closed, calc?.cp);
  const projectionGoal = monthlyGoal || weeklyGoal;
  const progress = (closed / goal) * 100;

  if (hasHitEffectiveGoal(calc)) return 'green';
  if (projectionGoal > 0 && projected >= projectionGoal) return 'amber';
  if (progress >= 55) return 'amber';
  return 'red';
}

function statusLabel(calc, status) {
  if (status === CLIENT_STATUS.ONBOARDING) return 'Onboard';
  if (status === CLIENT_STATUS.RAMPAGE) return 'Rampagem Comercial';
  if (status === CLIENT_STATUS.PAUSED) return 'Pausado';
  if (status === CLIENT_STATUS.CHURN) return 'Churn';

  const weeklyGoal = weeklyGoalTarget(calc);
  const monthlyGoal = monthlyGoalTarget(calc);
  const goal = weeklyGoal || monthlyGoal;
  if (!goal) return 'Sem meta';

  const closed = Number(calc?.fec) || 0;
  const projected = effectiveForecast(closed, calc?.cp);
  const projectionGoal = monthlyGoal || weeklyGoal;

  if (hasHitEffectiveGoal(calc)) return 'Meta batida';
  if (projectionGoal > 0 && projected >= projectionGoal) return 'Vai bater meta lucro';
  if ((closed / goal) * 100 >= 55) return 'Em andamento';
  return 'Crítico';
}

function predictionCard(closed, predicted, goal) {
  const target = Number(goal) || 0;
  const projected = effectiveForecast(closed, predicted);

  if (!target) {
    return {
      value: '0/0',
      sub: 'Sem meta configurada',
      tone: 'muted',
    };
  }

  const willHit = projected >= target;
  return {
    value: `${displayInt(projected)}/${displayInt(target)}`,
    sub: willHit ? 'Vai bater a meta' : 'Não vai bater meta',
    tone: willHit ? 'green' : 'red',
  };
}

function goalComparison(current, goal, { lowerIsBetter = false, format = displayInt } = {}) {
  const currentValue = Number(current) || 0;
  const goalValue = Number(goal) || 0;

  if (goalValue <= 0) return 'Sem meta configurada';

  const isGood = lowerIsBetter
    ? currentValue > 0 && currentValue <= goalValue
    : currentValue >= goalValue;

  const status = lowerIsBetter
    ? isGood ? 'Abaixo da meta' : 'Acima da meta'
    : isGood ? 'Acima da meta' : 'Abaixo da meta';

  return `Meta ${format(goalValue)} · ${status}`;
}

function comparisonTone(current, goal, { lowerIsBetter = false } = {}) {
  const currentValue = Number(current) || 0;
  const goalValue = Number(goal) || 0;

  if (goalValue <= 0) return currentValue > 0 ? 'neutral' : 'muted';

  const isGood = lowerIsBetter
    ? currentValue > 0 && currentValue <= goalValue
    : currentValue >= goalValue;

  return isGood ? 'green' : 'red';
}

function clientPriorityRank(row) {
  if (!row) return 0;

  const clientStatus = row.client?.status ?? row.status;
  if (!isActiveClientStatus(clientStatus)) return 0;

  const calc = row.calc || {};
  const weeklyGoal = weeklyGoalTarget(calc);
  const monthlyGoal = monthlyGoalTarget(calc);
  const goal = weeklyGoal || monthlyGoal;
  const closed = Number(calc.fec) || 0;
  const predicted = Number(calc.cp) || 0;
  const projected = effectiveForecast(closed, predicted);
  const projectionGoal = monthlyGoal || weeklyGoal;
  const progress = goal > 0 ? (closed / goal) * 100 : 0;

  // Quanto maior o rank, mais alto o cliente aparece na lista.
  // A categoria é obrigatoriamente mais importante que qualquer pontuação numérica.
  if (goal <= 0) return 3; // Sem meta
  if (hasHitEffectiveGoal(calc)) return 2; // Meta batida na semana vigente
  if (projectionGoal > 0 && projected >= projectionGoal) return 4; // Vai bater
  if (progress >= 55) return 5; // Em andamento

  return 6; // Crítico
}

function clientPriorityScore(row) {
  if (!row) return -100000;

  const clientStatus = row.client?.status ?? row.status;
  if (!isActiveClientStatus(clientStatus)) return -100000;

  const calc = row.calc || {};
  const goal = Number(calc.mLuc) || 0;
  const closed = Number(calc.fec) || 0;
  const predicted = Number(calc.cp) || 0;
  const projected = effectiveForecast(closed, predicted);
  const gap = goal > 0 ? Math.max(goal - closed, 0) : 0;
  const forecastGap = goal > 0 ? Math.max(goal - projected, 0) : 0;
  const progress = goal > 0 ? (closed / goal) * 100 : 0;

  // Usado apenas como desempate dentro da mesma categoria.
  // Prioriza menor progresso, maior distância da projeção e maior distância da meta.
  return forecastGap * 10000 + gap * 100 + Math.max(0, 100 - progress);
}

function initialsFromClient(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function dateInputValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseLocalDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(value, days) {
  const date = parseLocalDate(value) || new Date();
  date.setDate(date.getDate() + Number(days || 0));
  return dateInputValue(date);
}

function formatShortDate(value) {
  const date = parseLocalDate(value);
  if (!date) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function daysBetweenDates(fromValue, toValue = new Date()) {
  const from = parseLocalDate(fromValue);
  const to = toValue instanceof Date ? toValue : parseLocalDate(toValue);
  if (!from || !to || Number.isNaN(to.getTime())) return null;
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.floor((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / oneDay);
}

function routeStatusLabel(daysWithoutRoute) {
  if (!Number.isFinite(daysWithoutRoute)) return { label: 'Sem rota', tone: 'muted' };
  if (daysWithoutRoute < 1) return { label: 'Última rota hoje', tone: 'green' };
  if (daysWithoutRoute < 10) return { label: `Última rota há ${daysWithoutRoute} dias`, tone: 'green' };
  if (daysWithoutRoute <= 15) return { label: `Última rota há ${daysWithoutRoute} dias`, tone: 'amber' };
  return { label: `Última rota há ${daysWithoutRoute} dias`, tone: 'red' };
}

function buildRouteInfoForClient(meetings = [], today = new Date()) {
  const todayKey = dateInputValue(today);
  const completed = meetings
    .filter((meeting) => meeting.status === 'completed' && meeting.meetingDate)
    .sort((a, b) => String(b.meetingDate).localeCompare(String(a.meetingDate)));
  const scheduled = meetings
    .filter((meeting) => meeting.status === 'scheduled' && meeting.meetingDate)
    .sort((a, b) => String(a.meetingDate).localeCompare(String(b.meetingDate)));

  const lastCompleted = completed[0] || null;
  const nextScheduled = scheduled.find((meeting) => String(meeting.meetingDate) >= todayKey) || null;
  const pendingScheduled = scheduled.find((meeting) => String(meeting.meetingDate) < todayKey) || null;
  const daysWithoutRoute = lastCompleted ? daysBetweenDates(lastCompleted.meetingDate, today) : null;
  const status = routeStatusLabel(daysWithoutRoute);

  let alert = null;
  if (pendingScheduled) {
    alert = { label: 'Confirmar se a rota aconteceu', tone: 'amber' };
  } else if (!nextScheduled && Number.isFinite(daysWithoutRoute) && daysWithoutRoute > 15) {
    alert = { label: 'Rota vencida', tone: 'red' };
  } else if (!nextScheduled && Number.isFinite(daysWithoutRoute) && daysWithoutRoute >= 10) {
    alert = { label: 'Rota vencendo', tone: 'amber' };
  }

  return {
    lastCompleted,
    nextScheduled,
    pendingScheduled,
    daysWithoutRoute,
    statusLabel: status.label,
    statusTone: status.tone,
    alertLabel: alert?.label || '',
    alertTone: alert?.tone || '',
    nextLabel: nextScheduled ? `Próxima rota em ${formatShortDate(nextScheduled.meetingDate)}` : '',
  };
}

function monthCalendarCells(year, month0) {
  const first = new Date(year, month0, 1);
  const firstDay = first.getDay();
  const start = new Date(year, month0, 1 - firstDay);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      key: dateInputValue(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month0,
    };
  });
}

function getSquadCoverPosition(squad) {
  return {
    x: Number(squad?.coverPositionX ?? squad?.cover_position_x ?? 50),
    y: Number(squad?.coverPositionY ?? squad?.cover_position_y ?? 50),
    zoom: Number(squad?.coverZoom ?? squad?.cover_zoom ?? 100),
  };
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function squadCoverStyle(coverUrl, coverPosition = {}) {
  if (!coverUrl) return {};
  const x = clampNumber(coverPosition.x ?? 50, 50, 0, 100);
  const y = clampNumber(coverPosition.y ?? 50, 50, 0, 100);
  const zoom = clampNumber(coverPosition.zoom ?? 100, 100, 100, 220);
  // O render da capa não pode depender da largura da tela; caso contrário,
  // o preview do modal e a capa real ficam com enquadramentos diferentes.
  const renderWidth = Math.round(720 * (zoom / 100));
  const backgroundSize = `${renderWidth}px auto`;

  return {
    backgroundImage: `url(${coverUrl})`,
    backgroundPosition: `${x}% ${y}%`,
    backgroundSize,
    '--squad-cover-x': `${x}%`,
    '--squad-cover-y': `${y}%`,
    '--squad-cover-zoom': backgroundSize,
  };
}


function SquadSettingsModal({ squad, users = [], busy = false, canManageOwner = false, onClose, onSubmit }) {
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const [name, setName] = useState(squad?.name || '');
  const [ownerUserId, setOwnerUserId] = useState(squad?.ownerUserId || squad?.owner?.id || '');
  const [logoUrl, setLogoUrl] = useState(getSquadAvatar(squad));
  const [coverUrl, setCoverUrl] = useState(getSquadCover(squad));
  const [coverPosition, setCoverPosition] = useState(() => getSquadCoverPosition(squad));
  const [customSlug, setCustomSlug] = useState(squad?.customSlug || squad?.slug || slugifySegment(squad?.name || ''));

  useEffect(() => {
    setName(squad?.name || '');
    setOwnerUserId(squad?.ownerUserId || squad?.owner?.id || '');
    setLogoUrl(getSquadAvatar(squad));
    setCoverUrl(getSquadCover(squad));
    setCoverPosition(getSquadCoverPosition(squad));
    setCustomSlug(squad?.customSlug || squad?.slug || slugifySegment(squad?.name || ''));
  }, [squad]);

  async function handleLogoFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const dataUrl = await readAvatarFile(file);
    setLogoUrl(dataUrl);
  }

  async function handleCoverFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const dataUrl = await readCoverFile(file);
    setCoverUrl(dataUrl);
    setCoverPosition({ x: 50, y: 50, zoom: 100 });
  }

  if (!squad) return null;

  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="squad-settings-title" onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHead}>
          <div>
            <span>Estrutura operacional</span>
            <h3 id="squad-settings-title">Editar squad</h3>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fechar">
            <CloseIcon size={16} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.modalBody}>
          <section className={styles.squadCoverPanel}>
            <input ref={coverInputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={handleCoverFile} />
            <button
              type="button"
              className={styles.squadCoverEditor}
              style={squadCoverStyle(coverUrl, coverPosition)}
              onClick={() => coverInputRef.current?.click()}
            >
              {!coverUrl ? <span>Bandeira do squad</span> : null}
            </button>
            <div className={styles.modalActionsInline}>
              <button type="button" className={styles.modalGhostBtn} onClick={() => coverInputRef.current?.click()}>Alterar capa</button>
              {coverUrl ? (
                <button
                  type="button"
                  className={styles.modalGhostBtn}
                  onClick={() => {
                    setCoverUrl('');
                    setCoverPosition({ x: 50, y: 50, zoom: 100 });
                  }}
                >
                  Remover capa
                </button>
              ) : null}
            </div>
            {coverUrl ? (
              <div className={styles.coverControlsGrid}>
                <label className={styles.coverRangeField}>
                  <span>Horizontal</span>
                  <input type="range" min="0" max="100" value={coverPosition.x} onChange={(event) => setCoverPosition((prev) => ({ ...prev, x: Number(event.target.value) }))} />
                </label>
                <label className={styles.coverRangeField}>
                  <span>Vertical</span>
                  <input type="range" min="0" max="100" value={coverPosition.y} onChange={(event) => setCoverPosition((prev) => ({ ...prev, y: Number(event.target.value) }))} />
                </label>
                <label className={styles.coverRangeField}>
                  <span>Zoom</span>
                  <input type="range" min="100" max="220" value={coverPosition.zoom} onChange={(event) => setCoverPosition((prev) => ({ ...prev, zoom: Number(event.target.value) }))} />
                </label>
                <button type="button" className={styles.coverResetBtn} onClick={() => setCoverPosition({ x: 50, y: 50, zoom: 100 })}>Centralizar</button>
              </div>
            ) : null}
          </section>

          <section className={styles.squadIdentityPanel}>
            <input ref={fileInputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={handleLogoFile} />
            <button type="button" className={styles.squadAvatarEditor} onClick={() => fileInputRef.current?.click()}>
              {logoUrl ? <img src={logoUrl} alt="" /> : <span>{squadInitials(name)}</span>}
            </button>
            <div className={styles.squadIdentityFields}>
              <label className={styles.modalField}>
                <span>Nome do squad</span>
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus />
              </label>
              <div className={styles.modalActionsInline}>
                <button type="button" className={styles.modalGhostBtn} onClick={() => fileInputRef.current?.click()}>Alterar avatar</button>
                {logoUrl ? <button type="button" className={styles.modalGhostBtn} onClick={() => setLogoUrl('')}>Remover avatar</button> : null}
              </div>
            </div>
          </section>

          {canManageOwner ? (
            <label className={styles.modalField}>
              <span>Proprietário do squad</span>
              <UserPicker
                users={users}
                value={ownerUserId}
                onChange={setOwnerUserId}
                placeholder="Sem proprietário"
                showRole
                portal
                disableHover
              />
            </label>
          ) : null}

          <label className={styles.modalField}>
            <span>Link personalizado</span>
            <div className={styles.slugField}>
              <small>/squads/</small>
              <input
                value={customSlug}
                onChange={(event) => setCustomSlug(slugifySegment(event.target.value))}
                maxLength={120}
              />
            </div>
          </label>
        </div>

        <div className={styles.modalActions}>
          <button type="button" className={styles.modalGhostBtn} onClick={onClose} disabled={busy}>Cancelar</button>
          <button
            type="button"
            className={styles.modalPrimaryBtn}
            onClick={() => onSubmit({ name, ownerUserId, logoUrl, coverUrl, coverPosition, customSlug })}
            disabled={busy || !name.trim()}
          >
            {busy ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}



function monthYearLabel(year, month0) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month0, 1));
}

function displayDateForField(value) {
  const date = parseLocalDate(value);
  if (!date) return 'Selecionar data';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}

function isSameDateKey(a, b) {
  return String(a || '').slice(0, 10) === String(b || '').slice(0, 10);
}

function RouteScheduleModal({ clients = [], capName = '', initial = {}, busy = false, onClose, onSubmit }) {
  const [form, setForm] = useState(() => ({
    clientId: initial.clientId || clients[0]?.id || '',
    meetingDate: initial.meetingDate || dateInputValue(new Date()),
    capName: initial.capName || capName || '',
    status: initial.status || 'scheduled',
    notes: initial.notes || '',
  }));
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [dateView, setDateView] = useState(() => {
    const date = parseLocalDate(initial.meetingDate || new Date()) || new Date();
    return { year: date.getFullYear(), month0: date.getMonth() };
  });
  const clientMenuRef = useRef(null);
  const dateMenuRef = useRef(null);

  const selectedClient = useMemo(
    () => clients.find((client) => String(client.id) === String(form.clientId)) || clients[0] || null,
    [clients, form.clientId]
  );

  const filteredClients = useMemo(() => {
    const normalized = String(clientQuery || '').trim().toLowerCase();
    if (!normalized) return clients;
    return clients.filter((client) => matchesAnySearch([
      client.name,
      client.gestor,
      client.gdvName,
    ], normalized));
  }, [clients, clientQuery]);

  const dateCells = useMemo(() => monthCalendarCells(dateView.year, dateView.month0), [dateView.month0, dateView.year]);
  const todayKey = dateInputValue(new Date());

  useEffect(() => {
    const handlePointer = (event) => {
      if (clientMenuRef.current && !clientMenuRef.current.contains(event.target)) {
        setClientMenuOpen(false);
      }
      if (dateMenuRef.current && !dateMenuRef.current.contains(event.target)) {
        setDateMenuOpen(false);
      }
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setClientMenuOpen(false);
        setDateMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseClient(clientId) {
    setField('clientId', clientId);
    setClientMenuOpen(false);
    setClientQuery('');
  }

  function chooseDate(key) {
    setField('meetingDate', key);
    setDateMenuOpen(false);
  }

  function moveDateView(delta) {
    setDateView((current) => {
      const next = new Date(current.year, current.month0 + delta, 1);
      return { year: next.getFullYear(), month0: next.getMonth() };
    });
  }

  return (
    <div className={styles.routeModalBackdrop} role="presentation" onClick={onClose}>
      <section className={styles.routeModal} role="dialog" aria-modal="true" aria-label="Agendar rota" onClick={(event) => event.stopPropagation()}>
        <div className={styles.routeModalHead}>
          <div>
            <h3>{initial?.title || 'Agendar rota'}</h3>
          </div>
          <button type="button" className={styles.routeModalClose} onClick={onClose} aria-label="Fechar">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className={styles.routeModalBody}>
          <label className={`${styles.routeField} ${styles.routeClientField}`.trim()} ref={clientMenuRef}>
            <span>Cliente</span>
            <div className={styles.routeCombobox}>
              <button
                type="button"
                className={styles.routeComboboxButton}
                onClick={() => setClientMenuOpen((open) => !open)}
                disabled={busy || clients.length === 0}
                aria-haspopup="listbox"
                aria-expanded={clientMenuOpen}
              >
                <ClientName as="strong" client={selectedClient} name={selectedClient?.name || 'Selecionar cliente'} />
                <ChevronRightIcon size={14} aria-hidden="true" />
              </button>

              {clientMenuOpen ? (
                <div className={styles.routeComboboxMenu} role="listbox">
                  <label className={styles.routeComboboxSearch}>
                    <SearchIcon size={14} aria-hidden="true" />
                    <input
                      type="search"
                      value={clientQuery}
                      onChange={(event) => setClientQuery(event.target.value)}
                      placeholder="Buscar cliente"
                      autoFocus
                    />
                  </label>

                  <div className={styles.routeComboboxList}>
                    {filteredClients.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        className={`${styles.routeComboboxOption} ${String(client.id) === String(form.clientId) ? styles.routeComboboxOptionActive : ''}`.trim()}
                        onClick={() => chooseClient(client.id)}
                        role="option"
                        aria-selected={String(client.id) === String(form.clientId)}
                      >
                        <ClientName client={client} />
                      </button>
                    ))}
                    {!filteredClients.length ? <div className={styles.routeComboboxEmpty}>Nenhum cliente encontrado.</div> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </label>

          <div className={styles.routeField} ref={dateMenuRef}>
            <span>Data da reunião</span>
            <div className={styles.routeDatePicker}>
              <button
                type="button"
                className={styles.routeDateButton}
                onClick={() => setDateMenuOpen((open) => !open)}
                disabled={busy}
                aria-haspopup="dialog"
                aria-expanded={dateMenuOpen}
              >
                <strong>{displayDateForField(form.meetingDate)}</strong>
                <CalendarIcon size={15} aria-hidden="true" />
              </button>

              {dateMenuOpen ? (
                <div className={styles.routeDateMenu} role="dialog" aria-label="Selecionar data da reunião">
                  <div className={styles.routeDateMenuHeader}>
                    <strong>{monthYearLabel(dateView.year, dateView.month0)}</strong>
                    <div>
                      <button type="button" onClick={() => moveDateView(-1)} aria-label="Mês anterior"><ChevronLeftIcon size={14} /></button>
                      <button type="button" onClick={() => moveDateView(1)} aria-label="Próximo mês"><ChevronRightIcon size={14} /></button>
                    </div>
                  </div>

                  <div className={styles.routeDateWeekdays} aria-hidden="true">
                    {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
                  </div>

                  <div className={styles.routeDateGrid}>
                    {dateCells.map((cell) => (
                      <button
                        key={cell.key}
                        type="button"
                        className={[
                          styles.routeDateCell,
                          !cell.inMonth ? styles.routeDateCellMuted : '',
                          isSameDateKey(cell.key, todayKey) ? styles.routeDateCellToday : '',
                          isSameDateKey(cell.key, form.meetingDate) ? styles.routeDateCellSelected : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => chooseDate(cell.key)}
                      >
                        {cell.day}
                      </button>
                    ))}
                  </div>

                  <div className={styles.routeDateMenuFooter}>
                    <button type="button" onClick={() => {
                      const today = new Date();
                      const key = dateInputValue(today);
                      setDateView({ year: today.getFullYear(), month0: today.getMonth() });
                      chooseDate(key);
                    }}>Hoje</button>
                    <button type="button" onClick={() => setDateMenuOpen(false)}>Fechar</button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <label className={styles.routeField}>
            <span>CAP responsável</span>
            <input
              type="text"
              value={form.capName || capName || ''}
              readOnly
              disabled
              aria-readonly="true"
            />
          </label>

          <div className={styles.routeField}>
            <span>Status</span>
            <div className={styles.routeStatusSwitch} role="radiogroup" aria-label="Status da rota">
              <button
                type="button"
                className={form.status === 'scheduled' ? styles.routeStatusSwitchActive : ''}
                onClick={() => setField('status', 'scheduled')}
                disabled={busy}
                role="radio"
                aria-checked={form.status === 'scheduled'}
              >
                Agendada
              </button>
              <button
                type="button"
                className={form.status === 'completed' ? styles.routeStatusSwitchActive : ''}
                onClick={() => setField('status', 'completed')}
                disabled={busy}
                role="radio"
                aria-checked={form.status === 'completed'}
              >
                Realizada
              </button>
            </div>
          </div>

          <label className={`${styles.routeField} ${styles.routeFieldWide}`.trim()}>
            <span>Observações</span>
            <textarea value={form.notes} onChange={(event) => setField('notes', event.target.value)} placeholder="Observações opcionais" disabled={busy} />
          </label>
        </div>

        <div className={styles.routeModalActions}>
          <button type="button" className={styles.routeGhostButton} onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className={styles.routePrimaryButton} onClick={() => onSubmit({ ...form, capName: form.capName || capName || '' })} disabled={busy || !form.clientId || !form.meetingDate || !(form.capName || capName)}>
            {busy ? 'Salvando...' : 'Salvar rota'}
          </button>
        </div>
      </section>
    </div>
  );
}

function RouteDeleteConfirmModal({ meeting, busy = false, onClose, onConfirm }) {
  if (!meeting) return null;

  return (
    <div className={styles.routeConfirmBackdrop} role="presentation" onClick={onClose}>
      <section
        className={styles.routeConfirmDialog}
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirmar exclusão de rota"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.routeConfirmIcon} aria-hidden="true">
          <TrashIcon size={17} />
        </div>

        <div className={styles.routeConfirmContent}>
          <h3>Excluir rota?</h3>
          <p>{meeting.clientName || 'Cliente'} · {formatShortDate(meeting.meetingDate)}</p>
        </div>

        <div className={styles.routeConfirmActions}>
          <button type="button" className={styles.routeGhostButton} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className={styles.routeDangerButton} onClick={onConfirm} disabled={busy}>
            {busy ? 'Excluindo...' : 'Excluir rota'}
          </button>
        </div>
      </section>
    </div>
  );
}

function RouteCalendarPanel({ year, month0, meetings = [], onNewMeeting, onMarkCompleted, onDeleteMeeting }) {
  const cells = useMemo(() => monthCalendarCells(year, month0), [month0, year]);
  const todayKey = dateInputValue(new Date());
  const monthMeetings = useMemo(() => meetings.filter((meeting) => {
    const date = parseLocalDate(meeting.meetingDate);
    return date && date.getFullYear() === year && date.getMonth() === month0;
  }), [meetings, month0, year]);
  const meetingsByDate = useMemo(() => {
    const map = new Map();
    monthMeetings.forEach((meeting) => {
      const key = String(meeting.meetingDate || '').slice(0, 10);
      if (!key) return;
      const list = map.get(key) || [];
      list.push(meeting);
      map.set(key, list);
    });
    return map;
  }, [monthMeetings]);

  const scheduledCount = monthMeetings.filter((meeting) => meeting.status === 'scheduled').length;
  const completedCount = monthMeetings.filter((meeting) => meeting.status === 'completed').length;

  return (
    <section className={styles.routesPanel} aria-label="Calendário de rotas">
      <div className={styles.routesHeader}>
        <div>
          <h2>Calendário de rotas</h2>
        </div>

        <div className={styles.routesActions}>
          <div className={styles.routesSummary} aria-label="Resumo das rotas no período">
            <span><b>{displayInt(monthMeetings.length)}</b> rotas no período</span>
            <span><b>{displayInt(scheduledCount)}</b> agendadas</span>
            <span><b>{displayInt(completedCount)}</b> realizadas</span>
          </div>
          <button type="button" onClick={onNewMeeting}>
            <PlusIcon size={15} />
            Agendar rota
          </button>
        </div>
      </div>

      <div className={styles.routesCalendar}>
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => <span key={day} className={styles.routesWeekday}>{day}</span>)}
        {cells.map((cell) => {
          const dayMeetings = meetingsByDate.get(cell.key) || [];
          const isToday = isSameDateKey(cell.key, todayKey);
          return (
            <div key={cell.key} className={`${styles.routesDayCell} ${cell.inMonth ? '' : styles.routesDayMuted} ${isToday ? styles.routesDayToday : ''}`.trim()}>
              <span className={styles.routesDayNumber}>{cell.day}</span>
              <div className={styles.routesDayEvents}>
                {dayMeetings.slice(0, 3).map((meeting) => {
                  const completed = meeting.status === 'completed';
                  return (
                    <div key={meeting.id} className={`${styles.routesEvent} ${completed ? styles.routesEventDone : ''}`.trim()}>
                      <div className={styles.routesEventMain}>
                        <strong>{meeting.clientName}</strong>
                        <span>{completed ? 'Realizada' : 'Agendada'}</span>
                      </div>
                      <div className={styles.routesEventActions}>
                        {completed ? (
                          <span className={styles.routesEventStatus}>Realizada</span>
                        ) : (
                          <button type="button" className={styles.routesEventComplete} onClick={() => onMarkCompleted(meeting)}>Concluir</button>
                        )}
                        <button type="button" className={styles.routesEventDelete} onClick={() => onDeleteMeeting(meeting)} aria-label="Excluir rota">
                          <TrashIcon size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {dayMeetings.length > 3 ? <small>+{dayMeetings.length - 3} rota(s)</small> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function SquadPage() {
  const { squadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const {
    squads,
    clients,
    userDirectory,
    loading: shellLoading,
    setPanelHeader,
    refreshClients,
    refreshSquads,
  } = useOutletContext();

  const canManageSquads = hasPermission(user, 'squads.manage');
  const squad = useMemo(
    () => (Array.isArray(squads) ? squads.find((item) => matchesEntityRouteSegment(squadId, item)) : null),
    [squads, squadId]
  );

  const resolvedSquadId = squad?.id || squadId;
  const hasSquadAccess = useMemo(() => canAccessSquad(user, resolvedSquadId), [user, resolvedSquadId]);
  const canEditSquad = Boolean(squad?.ownerUserId && String(squad.ownerUserId) === String(user?.id || '')) || canManageSquads;

  useEffect(() => {
    if (!squad?.id || !squadId) return;
    const current = `/squads/${encodeURIComponent(String(squadId))}`;
    const canonical = buildSquadPath(squad);
    if (current !== canonical) navigate(canonical, { replace: true });
  }, [navigate, squad, squadId]);

  const now = useMemo(() => new Date(), []);
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const interval = window.setInterval(() => {
      const next = new Date();
      setToday((current) => (dayKey(current) === dayKey(next) ? current : next));
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [week, setWeek] = useState(() => currentWeek(now));
  const [query, setQuery] = useState('');
  const [portfolioFilter, setPortfolioFilter] = useState('all');
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [page, setPage] = useState(1);
  const [logoUrl, setLogoUrl] = useState(() => getSquadAvatar(squad));
  const [coverUrl, setCoverUrl] = useState(() => getSquadCover(squad));
  const [coverPosition, setCoverPosition] = useState(() => getSquadCoverPosition(squad));
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [ownershipTick, setOwnershipTick] = useState(0);
  const [metricsByKey, setMetricsByKey] = useState({});
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(null);
  const [routeMeetings, setRouteMeetings] = useState([]);
  const [routeMeetingsLoading, setRouteMeetingsLoading] = useState(false);
  const [routeMeetingsError, setRouteMeetingsError] = useState(null);
  const [routeModal, setRouteModal] = useState(null);
  const [routeDeleteTarget, setRouteDeleteTarget] = useState(null);
  const [routeSaving, setRouteSaving] = useState(false);
  const metricsFetchRef = useRef(0);
  const logoInputRef = useRef(null);
  const cardsRef = useRef(null);
  const [showStickyResult, setShowStickyResult] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showComplementaryMetrics, setShowComplementaryMetrics] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [renderStickyResult, setRenderStickyResult] = useState(false);

  const periodKey = useMemo(() => buildPeriodKey(year, month0, week), [year, month0, week]);
  const monthPeriodKeys = useMemo(
    () => WEEKS_IN_MONTH.slice(0, week).map((weekNumber) => buildPeriodKey(year, month0, weekNumber)),
    [month0, week, year]
  );

  const squadClients = useMemo(
    () =>
      (Array.isArray(clients) ? clients : []).filter(
        (client) =>
          client?.squadId === resolvedSquadId &&
          isClientAvailableForPeriod(client, year, month0) &&
          isPortfolioStatus(client.status)
      ),
    [clients, month0, resolvedSquadId, year]
  );

  const activeSquadClients = useMemo(
    () => squadClients.filter((client) => isActiveClientStatus(client.status)),
    [squadClients]
  );


  const reloadRouteMeetings = useCallback(async ({ signal } = {}) => {
    if (!resolvedSquadId) {
      setRouteMeetings([]);
      return;
    }
    setRouteMeetingsLoading(true);
    setRouteMeetingsError(null);
    try {
      const response = await listRouteMeetings({ squadId: resolvedSquadId }, { signal });
      setRouteMeetings(Array.isArray(response?.meetings) ? response.meetings : []);
    } catch (err) {
      if (signal?.aborted) return;
      setRouteMeetingsError(err);
    } finally {
      if (!signal?.aborted) setRouteMeetingsLoading(false);
    }
  }, [resolvedSquadId]);

  useEffect(() => {
    const controller = new AbortController();
    reloadRouteMeetings({ signal: controller.signal });
    return () => controller.abort();
  }, [reloadRouteMeetings]);


  const routeInfoByClient = useMemo(() => {
    const grouped = new Map();
    routeMeetings.forEach((meeting) => {
      if (!meeting?.clientId) return;
      const list = grouped.get(meeting.clientId) || [];
      list.push(meeting);
      grouped.set(meeting.clientId, list);
    });
    const map = new Map();
    squadClients.forEach((client) => {
      map.set(client.id, buildRouteInfoForClient(grouped.get(client.id) || [], today));
    });
    return map;
  }, [routeMeetings, squadClients, today]);

  useEffect(() => {
    setLogoUrl(getSquadAvatar(squad));
    setCoverUrl(getSquadCover(squad));
    setCoverPosition(getSquadCoverPosition(squad));
    return subscribeAvatarChange(() => {
      setLogoUrl(getSquadAvatar(squad));
      setCoverUrl(getSquadCover(squad));
      setCoverPosition(getSquadCoverPosition(squad));
    });
  }, [squad]);

  useEffect(() => subscribeOwnershipChange(() => setOwnershipTick((current) => current + 1)), []);

  const squadOwnership = useMemo(
    () => resolveSquadOwner(squad, userDirectory),
    [ownershipTick, squad, userDirectory]
  );

  useEffect(() => {
    if (!squadClients.length) {
      setMetricsByKey((prev) => {
        const next = { ...prev };
        monthPeriodKeys.forEach((key) => { next[key] = []; });
        return next;
      });
      return undefined;
    }

    const clientIds = squadClients.map((client) => client.id).sort().join('|');
    const keysToLoad = monthPeriodKeys.filter((key) => {
      const cached = metricsByKey[key];
      if (!Array.isArray(cached)) return true;
      const cachedIds = cached.map((entry) => entry.clientId).sort().join('|');
      return cachedIds !== clientIds;
    });

    if (!keysToLoad.length) return undefined;

    const gen = ++metricsFetchRef.current;
    const controller = new AbortController();
    let cancelled = false;
    const clientsSnapshot = [...squadClients];
    const METRIC_BATCH_SIZE = 8;

    setMetricsLoading(true);
    setMetricsError(null);

    async function loadSquadMetrics() {
      const periodResults = [];

      for (const key of keysToLoad) {
        if (cancelled || controller.signal.aborted || metricsFetchRef.current !== gen) return;
        const results = [];

        for (let index = 0; index < clientsSnapshot.length; index += METRIC_BATCH_SIZE) {
          if (cancelled || controller.signal.aborted || metricsFetchRef.current !== gen) return;
          const batch = clientsSnapshot.slice(index, index + METRIC_BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map((client) =>
              getMetric(client.id, key, { signal: controller.signal })
                .then((response) => ({ clientId: client.id, metric: response?.metric ? { ...response.metric, periodKey: key } : null, err: null }))
                .catch((err) => (controller.signal.aborted ? { clientId: client.id, metric: null, err: null, aborted: true } : { clientId: client.id, metric: null, err }))
            )
          );

          if (cancelled || controller.signal.aborted || metricsFetchRef.current !== gen) return;
          results.push(...batchResults);
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }

        periodResults.push({ key, results });
        setMetricsByKey((prev) => ({ ...prev, [key]: results }));
      }

      if (cancelled || controller.signal.aborted || metricsFetchRef.current !== gen) return;

      const flatResults = periodResults.flatMap((entry) => entry.results);
      const anyAuthError = flatResults.find(
        (result) => result.err instanceof ApiError && result.err.status === 401
      );
      if (anyAuthError) return;

      const failures = flatResults.filter(
        (result) => result.err && !(result.err instanceof ApiError && result.err.status === 404)
      );

      if (failures.length > 0 && failures.length === flatResults.length) {
        setMetricsError(new Error('Falha ao carregar métricas operacionais do squad.'));
      }
    }

    loadSquadMetrics()
      .catch((err) => {
        if (cancelled || controller.signal.aborted || metricsFetchRef.current !== gen) return;
        setMetricsError(err);
      })
      .finally(() => {
        if (!cancelled && !controller.signal.aborted && metricsFetchRef.current === gen) setMetricsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [metricsByKey, monthPeriodKeys, squadClients]);

  useEffect(() => {
    setPage(1);
  }, [query, week, month0, year, squadId]);

  const handlePickLogo = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !squad) return;

    setUploadingLogo(true);

    try {
      const dataUrl = await readAvatarFile(file);
      await updateSquad(squad.id, {
        name: squad.name,
        ownerUserId: squad.ownerUserId || squad.owner?.id || '',
        logoUrl: dataUrl,
        coverUrl: getSquadCover(squad),
        coverPositionX: getSquadCoverPosition(squad).x,
        coverPositionY: getSquadCoverPosition(squad).y,
        coverZoom: getSquadCoverPosition(squad).zoom,
        customSlug: squad.customSlug || squad.slug || '',
      });
      await refreshSquads?.();
      saveSquadAvatar(squad, dataUrl);
      setLogoUrl(dataUrl);
      showToast('Logotipo do squad atualizado.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível carregar a imagem.', { variant: 'error' });
    } finally {
      setUploadingLogo(false);
    }
  };


  const handleSaveSquadSettings = useCallback(
    async ({ name, ownerUserId, logoUrl: nextLogoUrl, coverUrl: nextCoverUrl, coverPosition: nextCoverPosition, customSlug }) => {
      if (!squad || !canEditSquad) return;
      setSettingsSaving(true);
      try {
        const nextName = String(name || '').trim();
        const response = await updateSquad(squad.id, {
          name: nextName,
          ownerUserId: ownerUserId || '',
          logoUrl: nextLogoUrl || '',
          coverUrl: nextCoverUrl || '',
          coverPositionX: Number(nextCoverPosition?.x ?? 50),
          coverPositionY: Number(nextCoverPosition?.y ?? 50),
          coverZoom: Number(nextCoverPosition?.zoom ?? 100),
          customSlug: customSlug || '',
        });
        await refreshSquads?.();
        const savedSquad = response?.squad || {
          ...squad,
          name: nextName,
          coverUrl: nextCoverUrl || '',
          coverPositionX: Number(nextCoverPosition?.x ?? 50),
          coverPositionY: Number(nextCoverPosition?.y ?? 50),
          coverZoom: Number(nextCoverPosition?.zoom ?? 100),
          customSlug,
        };
        navigate(buildSquadPath(savedSquad, nextName), { replace: true });
        if (nextLogoUrl) {
          saveSquadAvatar(squad, nextLogoUrl);
        } else {
          removeSquadAvatar(squad);
        }
        setLogoUrl(nextLogoUrl || '');
        setCoverUrl(nextCoverUrl || '');
        setCoverPosition({
          x: Number(nextCoverPosition?.x ?? 50),
          y: Number(nextCoverPosition?.y ?? 50),
          zoom: Number(nextCoverPosition?.zoom ?? 100),
        });
        setSettingsOpen(false);
        setOwnershipTick((current) => current + 1);
        showToast('Squad atualizado.', { variant: 'success' });
      } catch (err) {
        showToast(err?.message || 'Não foi possível atualizar o squad.', { variant: 'error' });
      } finally {
        setSettingsSaving(false);
      }
    },
    [canEditSquad, navigate, refreshSquads, showToast, squad]
  );


  const metricRows = metricsByKey[periodKey] || [];

  const clientRows = useMemo(() => {
    return squadClients.map((client) => {
      const metricEntry = metricRows.find((row) => row.clientId === client.id);
      const metric = metricEntry?.metric || { data: {}, computed: {}, periodKey };
      const monthMetrics = monthPeriodKeys
        .flatMap((key) => metricsByKey[key] || [])
        .filter((row) => row.clientId === client.id && row.metric)
        .map((row) => ({ ...row.metric, periodKey: row.metric?.periodKey || key }));
      const goal = effectiveWeeklyGoal({ currentMetric: metric, monthMetrics, week, client });
      const calc = applyWeeklyGoal(calcWeek(metric, { client }), goal);
      const weeklyHasGoal = calc.mLuc > 0;
      const weeklyProgress = weeklyHasGoal ? (calc.fec / calc.mLuc) * 100 : 0;
      const weeklyGap = weeklyHasGoal ? Math.max(calc.mLuc - calc.fec, 0) : 0;
      const forecastGap = weeklyHasGoal
        ? Math.max(calc.mLuc - effectiveForecast(calc.fec, calc.cp), 0)
        : 0;
      const tone = statusTone(calc, client.status);
      const statusText = statusLabel(calc, client.status);
      const onboardingDays = getClientOnboardingDays(client, today);
      const routeInfo = routeInfoByClient.get(client.id) || buildRouteInfoForClient([], today);

      const row = {
        ...client,
        metric,
        calc,
        weeklyProgress,
        weeklyGap,
        forecastGap,
        weeklyHasGoal,
        tone,
        statusText,
        onboardingDays,
        routeInfo,
      };

      return {
        ...row,
        priorityRank: clientPriorityRank(row),
        priorityScore: clientPriorityScore(row),
      };
    });
  }, [metricRows, metricsByKey, monthPeriodKeys, periodKey, routeInfoByClient, squadClients, today, week]);


  const activeClientRows = useMemo(
    () => clientRows.filter((row) => isActiveClientStatus(row.status)),
    [clientRows]
  );

  const squadHeaderMrr = useMemo(() => {
    return clientRows
      .filter((row) => isPortfolioStatus(row.status))
      .reduce((total, row) => total + resolveClientFeeAtMonthEnd(row, year, month0), 0);
  }, [clientRows, month0, year]);

  const agg = useMemo(() => aggregateCarteira(activeClientRows), [activeClientRows]);

  const complementaryMetrics = useMemo(() => {
    const activeRows = clientRows.filter((row) => isActiveClientStatus(row.status));
    const onboardingRows = clientRows.filter((row) => row.status === CLIENT_STATUS.ONBOARDING);
    const rampageRows = clientRows.filter((row) => row.status === CLIENT_STATUS.RAMPAGE);
    const pausedRows = clientRows.filter((row) => row.status === CLIENT_STATUS.PAUSED);

    const hitContracts = activeRows.filter((row) => {
      const closed = Number(row.calc?.fec) || 0;
      const target = Number(row.calc?.mEmp) || 0;
      return target > 0 && closed >= target;
    });

    const hitProfit = activeRows.filter((row) => {
      const closed = Number(row.calc?.fec) || 0;
      const target = monthlyGoalTarget(row.calc);
      return target > 0 && closed >= target;
    });

    const belowGoal = activeRows.filter((row) => {
      const closed = Number(row.calc?.fec) || 0;
      const contractTarget = Number(row.calc?.mEmp) || 0;
      const profitTarget = monthlyGoalTarget(row.calc);

      if (contractTarget > 0 && closed < contractTarget) return true;
      if (profitTarget > 0 && closed < profitTarget) return true;
      return false;
    });

    const activeTotal = activeRows.length;

    return [
      { id: 'active', label: 'Clientes ativos', value: displayInt(activeTotal), sub: 'base da meta' },
      { id: 'contracts', label: 'Bateram meta contratos', value: `${displayInt(hitContracts.length)} de ${displayInt(activeTotal)}`, sub: 'meta empate' },
      { id: 'profit', label: 'Bateram meta lucro', value: `${displayInt(hitProfit.length)} de ${displayInt(activeTotal)}`, sub: 'meta lucro' },
      { id: 'below', label: 'Abaixo da meta', value: `${displayInt(belowGoal.length)} de ${displayInt(activeTotal)}`, sub: 'clientes ativos' },
      { id: 'onboarding', label: 'Onboarding', value: displayInt(onboardingRows.length), sub: 'fora da meta' },
      { id: 'rampage', label: 'Rampagem Comercial', value: displayInt(rampageRows.length), sub: 'fora da meta' },
      { id: 'paused', label: 'Pausados', value: displayInt(pausedRows.length), sub: 'fora da meta' },
    ];
  }, [clientRows]);

  useEffect(() => {
    if (!selectedClientId) return;
    if (!clientRows.some((row) => row.id === selectedClientId)) {
      setSelectedClientId(null);
    }
  }, [clientRows, selectedClientId]);

  const selectedClient = useMemo(
    () => clientRows.find((row) => row.id === selectedClientId) || null,
    [clientRows, selectedClientId]
  );

  useEffect(() => {
    if (!selectedClient || !cardsRef.current) {
      setShowStickyResult(false);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowStickyResult(!entry.isIntersecting);
      },
      {
        threshold: 0.08,
        rootMargin: '-12px 0px 0px 0px',
      }
    );

    observer.observe(cardsRef.current);

    return () => observer.disconnect();
  }, [selectedClient?.id]);

  useEffect(() => {
    if (showStickyResult) {
      setRenderStickyResult(true);
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setRenderStickyResult(false);
    }, 170);

    return () => window.clearTimeout(timeout);
  }, [showStickyResult]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim();
    const base = [...clientRows].sort((a, b) => {
      const rankDiff = b.priorityRank - a.priorityRank;
      if (rankDiff !== 0) return rankDiff;

      const scoreDiff = b.priorityScore - a.priorityScore;
      if (scoreDiff !== 0) return scoreDiff;

      return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    });

    const byStatus = (() => {
      if (portfolioFilter === 'onboarding') {
        return base.filter((row) => row.status === CLIENT_STATUS.ONBOARDING);
      }

      if (portfolioFilter === 'rampage') {
        return base.filter((row) => row.status === CLIENT_STATUS.RAMPAGE);
      }

      if (portfolioFilter === 'internalCommercial') {
        return base.filter((row) => hasInternalCommercial(row));
      }

      return base.filter((row) => isActiveClientStatus(row.status));
    })();

    if (!normalized) return byStatus;
    return byStatus.filter((row) => matchesAnySearch([row.name, row.gestor, row.gdvName, row.internalSeller], normalized));
  }, [clientRows, portfolioFilter, query]);

  const portfolioEmptyLabel = useMemo(() => {
    if (query.trim()) return 'Busca sem resultados';
    if (portfolioFilter === 'onboarding') return 'Sem clientes em onboarding';
    if (portfolioFilter === 'rampage') return 'Sem rampagem comercial';
    if (portfolioFilter === 'internalCommercial') return 'Sem clientes com comercial interno';
    return 'Carteira sem clientes';
  }, [portfolioFilter, query]);


  const portfolioFilterItems = useMemo(() => {
    const activeRows = clientRows.filter((row) => isActiveClientStatus(row.status));
    const rampageRows = clientRows.filter((row) => row.status === CLIENT_STATUS.RAMPAGE);
    const onboardingRows = clientRows.filter((row) => row.status === CLIENT_STATUS.ONBOARDING);
    const internalCommercialRows = clientRows.filter(hasInternalCommercial);
    const routeRows = routeMeetings.filter((meeting) => {
      const date = parseLocalDate(meeting?.meetingDate);
      return date && date.getFullYear() === year && date.getMonth() === month0;
    });

    return [
      { id: 'all', label: 'Carteira', count: activeRows.length },
      { id: 'rampage', label: 'Rampagem', count: rampageRows.length },
      { id: 'onboarding', label: 'Onboard', count: onboardingRows.length },
      { id: 'internalCommercial', label: 'Comercial Interno', count: internalCommercialRows.length },
      { id: 'routes', label: 'Rotas', count: routeRows.length },
    ];
  }, [clientRows, month0, routeMeetings, year]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [portfolioFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  const pageStart = filteredRows.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const pageEnd = filteredRows.length ? Math.min(page * PAGE_SIZE, filteredRows.length) : 0;

  const prevMonth = useCallback(() => {
    setMonth0((value) => {
      if (value === 0) {
        setYear((current) => current - 1);
        return 11;
      }
      return value - 1;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setMonth0((value) => {
      if (value === 11) {
        setYear((current) => current + 1);
        return 0;
      }
      return value + 1;
    });
  }, []);

  useEffect(() => {
    if (!squad) return;

    const title = (
      <div className={styles.headerIdentity}>
        <button
          type="button"
          className={styles.headerLogo}
          onClick={() => canEditSquad && logoInputRef.current?.click()}
          disabled={!canEditSquad || uploadingLogo}
          aria-label={canEditSquad ? 'Enviar logotipo do squad' : undefined}
          title={canEditSquad ? 'Clique para trocar o logotipo' : squad.name}
        >
          {logoUrl ? <img src={logoUrl} alt="" /> : <span>{squadInitials(squad.name)}</span>}
          {canEditSquad ? <em>Configurar</em> : null}
        </button>

        <div className={styles.headerTitleText}>
          <strong>{squad.name}</strong>
          <small>{squadOwnership.owner?.name || (squadOwnership.active ? 'Squad ativo' : 'Squad desativado')}</small>
        </div>

        <span className={styles.headerMrr}>{fmtMoney(squadHeaderMrr)}</span>

        {coverUrl ? (
          <span className={styles.headerCoverBackground} style={squadCoverStyle(coverUrl, coverPosition)} aria-hidden="true" />
        ) : null}
      </div>
    );

    const actions = (
      <div className={styles.headerActions}>
        <div className={styles.headerCluster}>
          <span className={styles.headerStat}>
            <UsersIcon size={15} aria-hidden="true" />
            <strong>{displayInt(activeSquadClients.length)}</strong>
          </span>

          <div className={styles.monthNav}>
            <button type="button" className={styles.navBtn} onClick={prevMonth} aria-label="Mês anterior">
              <ChevronLeftIcon size={15} aria-hidden="true" />
            </button>
            <div className={styles.monthLabel}>
              {MONTHS[month0]} {year}
            </div>
            <button type="button" className={styles.navBtn} onClick={nextMonth} aria-label="Próximo mês">
              <ChevronRightIcon size={15} aria-hidden="true" />
            </button>
          </div>

          <div className={styles.weekTabs} role="tablist" aria-label="Semana">
            {[1, 2, 3, 4].map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={week === value}
                className={`${styles.weekTab} ${week === value ? styles.weekTabActive : ''}`.trim()}
                onClick={() => setWeek(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>


        <div className={styles.headerCluster}>
          {canEditSquad ? (
            <button
              type="button"
              className={`${styles.headerGhostBtn} ${styles.iconButton}`.trim()}
              onClick={() => setSettingsOpen(true)}
              aria-label="Configurar squad"
              title="Configurar squad"
            >
              <SettingsIcon size={14} aria-hidden="true" />
            </button>
          ) : null}

          <button
            type="button"
            className={`${styles.headerGhostBtn} ${styles.iconButton}`.trim()}
            aria-label="Atualizar visão"
            title="Atualizar visão"
            onClick={() => refreshClients?.()}
          >
            <RotateCcwIcon size={14} aria-hidden="true" />
          </button>

          <Link
            to="/ranking-squads"
            className={`${styles.headerBtn} ${styles.iconButton}`.trim()}
            aria-label="Ver ranking"
            title="Ver ranking"
          >
            <TrophyIcon size={14} aria-hidden="true" />
          </Link>

        </div>
      </div>
    );

    setPanelHeader({ title, actions });
  }, [
    canEditSquad,
    logoUrl,
    month0,
    nextMonth,
    prevMonth,
    refreshClients,
    setPanelHeader,
    squad,
    activeSquadClients.length,
    squadHeaderMrr,
    squadOwnership.active,
    squadOwnership.owner?.name,
    uploadingLogo,
    week,
    year,
  ]);

  const topCards = useMemo(() => {
    if (selectedClient) {
      const prediction = predictionCard(
        selectedClient.calc.fec,
        selectedClient.calc.cp,
        selectedClient.calc.mLuc
      );

      return [
        {
          id: 'closed',
          label: 'Contratos fechados',
          value: displayInt(selectedClient.calc.fec),
          sub: `Semana ${week}`,
          tone: 'neutral',
        },
        {
          id: 'profitGoal',
          label: 'Meta de lucro',
          value: selectedClient.calc.monthlyGoal > 0 ? displayInt(selectedClient.calc.monthlyGoal) : '—',
          sub: selectedClient.calc.monthlyGoal > 0
            ? `${displayInt(Math.max(selectedClient.calc.monthlyGoal - selectedClient.calc.fec, 0))} para bater no mês`
            : 'Sem meta configurada',
          tone: selectedClient.calc.monthlyGoal > 0 ? 'neutral' : 'muted',
        },
        {
          id: 'weeklyGoal',
          label: 'Meta semanal',
          value: selectedClient.calc.mLuc > 0 ? displayInt(selectedClient.calc.mLuc) : '—',
          sub: selectedClient.calc.weeklyCarryover > 0 ? `Semana ${week} · inclui ${displayInt(selectedClient.calc.weeklyCarryover)} acumulado` : `Semana ${week}`,
          tone: selectedClient.calc.mLuc > 0 ? 'neutral' : 'muted',
        },
        {
          id: 'predictedContracts',
          label: 'Contratos previstos',
          value: selectedClient.calc.cp > 0 ? displayInt(selectedClient.calc.cp) : '0',
          sub: prediction.sub,
          tone: prediction.tone,
        },
        {
          id: 'conversion',
          label: 'Taxa de conversão',
          value: selectedClient.calc.taxa > 0 ? displayPct(selectedClient.calc.taxa) : '—',
          sub: selectedClient.calc.vol > 0 ? `${displayInt(selectedClient.calc.vol)} leads reais` : '',
          tone: selectedClient.calc.taxa > 0 ? 'neutral' : 'muted',
        },
        {
          id: 'cpl',
          label: 'CPL atual',
          value: selectedClient.calc.cpl > 0 ? fmtMoney(selectedClient.calc.cpl) : '—',
          sub: goalComparison(selectedClient.calc.cpl, selectedClient.calc.mCpl, {
            lowerIsBetter: true,
            format: fmtMoney,
          }),
          tone: comparisonTone(selectedClient.calc.cpl, selectedClient.calc.mCpl, {
            lowerIsBetter: true,
          }),
        },
        {
          id: 'leads',
          label: 'Leads previstos',
          value: selectedClient.calc.lp > 0 ? displayInt(selectedClient.calc.lp) : '0',
          sub: goalComparison(selectedClient.calc.lp, selectedClient.calc.mVol),
          tone: comparisonTone(selectedClient.calc.lp, selectedClient.calc.mVol),
        },
      ];
    }

    const prediction = predictionCard(agg.tF, agg.tCp, agg.tLuc);
    const weeklyGoal = Number(agg.tLuc) || 0;
    const monthlyGoal = Number(agg.tMonthLuc) || 0;
    const remainingContracts = Math.max(monthlyGoal - (Number(agg.tF) || 0), 0);

    return [
      {
        id: 'closed',
        label: 'Contratos fechados',
        value: displayInt(agg.tF),
        sub: `Semana ${week}`,
        tone: agg.tF > 0 ? 'neutral' : 'muted',
      },
      {
        id: 'profitGoal',
        label: 'Meta de lucro',
        value: monthlyGoal > 0 ? displayInt(monthlyGoal) : '—',
        sub: monthlyGoal > 0
          ? `${displayInt(remainingContracts)} para bater`
          : 'Sem meta configurada',
        tone: monthlyGoal > 0 ? 'neutral' : 'muted',
      },
      {
        id: 'weeklyGoal',
        label: 'Meta semanal',
        value: weeklyGoal > 0 ? displayInt(weeklyGoal) : '—',
        sub: `Semana ${week}`,
        tone: weeklyGoal > 0 ? 'neutral' : 'muted',
      },
      {
        id: 'predictedContracts',
        label: 'Contratos previstos',
        value: agg.tCp > 0 ? displayInt(agg.tCp) : '0',
        sub: agg.tLuc > 0 ? prediction.sub : 'Sem meta configurada',
        tone: agg.tLuc > 0 ? prediction.tone : 'muted',
      },
      {
        id: 'conversion',
        label: 'Taxa de conversão',
        value: agg.taxa > 0 ? displayPct(agg.taxa) : '—',
        sub: agg.tVol > 0 ? `${displayInt(agg.tVol)} leads reais` : '',
        tone: agg.taxa > 0 ? 'neutral' : 'muted',
      },
      {
        id: 'cpl',
        label: 'CPL atual',
        value: agg.cpl > 0 ? fmtMoney(agg.cpl) : '—',
        sub: goalComparison(agg.cpl, agg.avgMC, {
          lowerIsBetter: true,
          format: fmtMoney,
        }),
        tone: comparisonTone(agg.cpl, agg.avgMC, {
          lowerIsBetter: true,
        }),
      },
      {
        id: 'leads',
        label: 'Leads previstos',
        value: agg.tLp > 0 ? displayInt(agg.tLp) : '0',
        sub: goalComparison(agg.tLp, agg.tMV),
        tone: comparisonTone(agg.tLp, agg.tMV),
      },
    ];
  }, [agg, clientRows, selectedClient, week]);


  const handleOpenRouteModal = useCallback((initial = {}) => {
    setRouteModal({
      clientId: initial.clientId || selectedClientId || activeSquadClients[0]?.id || squadClients[0]?.id || '',
      meetingDate: initial.meetingDate || dateInputValue(new Date()),
      capName: initial.capName || squadOwnership.owner?.name || user?.name || '',
      status: initial.status || 'scheduled',
      notes: initial.notes || '',
      title: initial.title || 'Agendar rota',
    });
  }, [activeSquadClients, selectedClientId, squadClients, squadOwnership.owner?.name, user?.name]);

  const handleSaveRouteMeeting = useCallback(async (form) => {
    setRouteSaving(true);
    try {
      await createRouteMeeting({
        clientId: form.clientId,
        meetingDate: form.meetingDate,
        capName: form.capName,
        status: form.status,
        notes: form.notes,
      });
      setRouteModal(null);
      await reloadRouteMeetings();
      showToast('Rota salva no calendário.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível salvar a rota.', { variant: 'error' });
    } finally {
      setRouteSaving(false);
    }
  }, [reloadRouteMeetings, showToast]);

  const handleMarkRouteCompleted = useCallback(async (meeting) => {
    if (!meeting?.id) return;
    setRouteSaving(true);
    try {
      await updateRouteMeeting(meeting.id, { status: 'completed' });
      await reloadRouteMeetings();
      showToast('Rota marcada como realizada.', { variant: 'success' });
      setRouteModal({
        clientId: meeting.clientId,
        meetingDate: addDays(meeting.meetingDate || new Date(), 15),
        capName: meeting.capName || squadOwnership.owner?.name || user?.name || '',
        status: 'scheduled',
        notes: '',
        title: 'Agendar próxima rota',
      });
    } catch (err) {
      showToast(err?.message || 'Não foi possível atualizar a rota.', { variant: 'error' });
    } finally {
      setRouteSaving(false);
    }
  }, [reloadRouteMeetings, showToast, squadOwnership.owner?.name, user?.name]);


  const handleDeleteRouteMeeting = useCallback((meeting) => {
    if (!meeting?.id) return;
    setRouteDeleteTarget(meeting);
  }, []);

  const handleConfirmDeleteRouteMeeting = useCallback(async () => {
    if (!routeDeleteTarget?.id) return;

    setRouteSaving(true);
    try {
      await deleteRouteMeeting(routeDeleteTarget.id);
      await reloadRouteMeetings();
      setRouteDeleteTarget(null);
      showToast('Rota excluída.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível excluir a rota.', { variant: 'error' });
    } finally {
      setRouteSaving(false);
    }
  }, [reloadRouteMeetings, routeDeleteTarget, showToast]);

  if (shellLoading && !squad) {
    return (
      <div className={styles.page}>
        <StateBlock variant="loading" title="Carregando squad" />
      </div>
    );
  }

  if (!hasSquadAccess) {
    return (
      <div className={styles.page}>
        <StateBlock
          variant="error"
          title="Acesso ao squad"
          action={<Link to="/acesso-negado" className={styles.inlineAction}>Ver permissões</Link>}
        />
      </div>
    );
  }

  if (!squad) {
    return (
      <div className={styles.page}>
        <StateBlock
          variant="empty"
          title="Squad não encontrado"
          action={<Link to="/" className={styles.inlineAction}>Voltar para o Dashboard</Link>}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        onChange={handlePickLogo}
      />

      {settingsOpen ? (
        <SquadSettingsModal
          squad={squad}
          users={Array.isArray(userDirectory) ? userDirectory : []}
          busy={settingsSaving}
          canManageOwner={canManageSquads}
          onClose={() => setSettingsOpen(false)}
          onSubmit={handleSaveSquadSettings}
        />
      ) : null}


      {routeModal ? (
        <RouteScheduleModal
          clients={squadClients}
          capName={squadOwnership.owner?.name || user?.name || ''}
          initial={routeModal}
          busy={routeSaving}
          onClose={() => setRouteModal(null)}
          onSubmit={handleSaveRouteMeeting}
        />
      ) : null}

      {routeDeleteTarget ? (
        <RouteDeleteConfirmModal
          meeting={routeDeleteTarget}
          busy={routeSaving}
          onClose={() => (routeSaving ? null : setRouteDeleteTarget(null))}
          onConfirm={handleConfirmDeleteRouteMeeting}
        />
      ) : null}

      {false && selectedClient && renderStickyResult ? (
        <section className={`${styles.stickyResultBar} ${showStickyResult ? styles.stickyVisible : styles.stickyLeaving}`.trim()}>
          <span className={styles.clientAvatarMini}>{selectedClient.avatarUrl ? <img src={selectedClient.avatarUrl} alt="" /> : initialsFromClient(selectedClient.name)}</span>
          <ClientName as="strong" client={selectedClient} />

          <div className={styles.stickyMetric}>
            <span>Fechados</span>
            <b>{displayInt(selectedClient.calc.fec)}</b>
          </div>

          <div className={styles.stickyMetric}>
            <span>Meta</span>
            <b>{selectedClient.calc.mLuc > 0 ? displayInt(selectedClient.calc.mLuc) : '—'}</b>
          </div>

          <div className={styles.stickyMetric}>
            <span>Gap</span>
            <b>{selectedClient.calc.mLuc > 0 ? displayInt(selectedClient.weeklyGap) : '—'}</b>
          </div>

          <span className={`${styles.badge} ${toneClass(styles, selectedClient.tone)} ${statusVisualClass(selectedClient.statusText)}`.trim()}>
            {selectedClient.statusText}
          </span>

          <button type="button" className={styles.clearSelectionMini} onClick={() => setSelectedClientId(null)}>
            Limpar
          </button>
        </section>
      ) : null}

      <section className={styles.topArea}>
        <section ref={cardsRef} className={styles.metricGrid}>
          {topCards.map((card) => (
            <article key={card.id} className={styles.metricCard}>
              <span className={styles.metricLabel}>{card.label}</span>
              <strong className={`${styles.metricValue} ${toneClass(styles, card.tone)}`.trim()}>
                {card.value}
              </strong>
              <span className={`${styles.metricSub} ${toneClass(styles, card.tone)}`.trim()}>
                {card.sub}
              </span>
            </article>
          ))}
        </section>

        <section className={styles.listToolbar}>
          <div className={styles.toolbarControls}>
            <label className={styles.searchBox}>
              <SearchIcon size={15} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar cliente, gestor ou GDV..."
                aria-label="Buscar cliente no squad"
              />
            </label>

            <div className={styles.portfolioFilter} role="tablist" aria-label="Filtro da carteira">
              {portfolioFilterItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={portfolioFilter === item.id}
                  className={[
                    styles.portfolioFilterTab,
                    portfolioFilter === item.id ? styles.portfolioFilterActive : '',
                    item.id === 'rampage' ? styles.portfolioFilterRampage : '',
                    item.id === 'onboarding' ? styles.portfolioFilterOnboarding : '',
                    item.id === 'internalCommercial' ? styles.portfolioFilterInternal : '',
                    item.id === 'routes' ? styles.portfolioFilterRoutes : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setPortfolioFilter(item.id)}
                >
                  <span>{item.label}</span>
                  <span className={styles.portfolioFilterCount}>{displayInt(item.count)}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className={`${styles.complementaryButton} ${showComplementaryMetrics ? styles.complementaryButtonActive : ''}`.trim()}
              onClick={() => setShowComplementaryMetrics((open) => !open)}
              aria-expanded={showComplementaryMetrics}
            >
              <span>Indicadores</span>
            </button>
          </div>
        </section>
      </section>

      {portfolioFilter === 'routes' ? (
        <>
          <RouteCalendarPanel
            year={year}
            month0={month0}
            meetings={routeMeetings}
            onNewMeeting={() => handleOpenRouteModal()}
            onMarkCompleted={handleMarkRouteCompleted}
            onDeleteMeeting={handleDeleteRouteMeeting}
          />

          {routeMeetingsLoading ? <div className={styles.routesInlineState}>Carregando calendário de rotas...</div> : null}
          {routeMeetingsError ? <div className={styles.routesInlineState}>Não foi possível carregar o calendário de rotas.</div> : null}
        </>
      ) : null}

      {showComplementaryMetrics ? (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setShowComplementaryMetrics(false)}>
          <section className={styles.indicatorsModal} role="dialog" aria-modal="true" aria-label="Indicadores da carteira" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHead}>
              <div>
                <span>Carteira do squad</span>
                <h3>Indicadores</h3>
              </div>
              <button type="button" className={styles.modalClose} onClick={() => setShowComplementaryMetrics(false)} aria-label="Fechar indicadores">
                <CloseIcon size={16} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.indicatorsGrid}>
              {complementaryMetrics.map((item) => (
                <article key={item.id} className={styles.indicatorsCard}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.sub}</small>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {portfolioFilter !== 'routes' ? (
        <section className={styles.listCard}>
          {metricsError ? (
          <StateBlock variant="warning" compact title="Métricas indisponíveis" />
        ) : filteredRows.length === 0 ? (
          <div className={styles.portfolioEmpty} role="status">
            <span className={styles.portfolioEmptyMarker} aria-hidden="true" />
            <strong>{portfolioEmptyLabel}</strong>
          </div>
        ) : (
          <>
            <div className={styles.clientList}>
              {pagedRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`${styles.clientRow} ${selectedClientId === row.id ? styles.clientRowActive : ''}`.trim()}
                  onClick={() => setSelectedClientId(row.id)}
                >
                  <div className={styles.clientMain}>
                    <span className={styles.clientAvatarSmall}>{row.avatarUrl ? <img src={row.avatarUrl} alt="" /> : initialsFromClient(row.name)}</span>
                    <div>
                      <strong>{row.name}</strong>
                      <span>
                        {row.gestor || 'Sem gestor'}
                        {row.gdvName ? ` · ${row.gdvName}` : ''}
                        {hasInternalCommercial(row) ? ` · Comercial interno: ${row.internalSeller}` : ''}
                      </span>
                    </div>
                  </div>

                  <div className={styles.clientStats}>
                    <div>
                      <span>Mensalidade</span>
                      <strong>{fmtMoney(resolveClientFeeAtMonthEnd(row, year, month0))}</strong>
                    </div>
                    <div>
                      <span>Fechados</span>
                      <strong>{displayInt(row.calc.fec)}</strong>
                    </div>
                  </div>

                  <div className={styles.clientStatus}>
                    {row.routeInfo?.alertLabel ? (
                      <span className={`${styles.routeAlertBadge} ${styles[`routeAlertBadge_${row.routeInfo.alertTone}`] || ''}`.trim()}>
                        {row.routeInfo.alertLabel}
                      </span>
                    ) : null}
                    <span className={`${styles.routeStatusBadge} ${styles[`routeStatusBadge_${row.routeInfo?.statusTone || 'muted'}`] || ''}`.trim()}>
                      {row.routeInfo?.statusLabel || 'Sem rota'}
                    </span>
                    {row.routeInfo?.nextLabel ? <span className={styles.routeNextLabel}>{row.routeInfo.nextLabel}</span> : null}
                    {Number.isFinite(row.onboardingDays) ? (
                      <span className={`${styles.onboardingDays} ${styles[`onboardingDays_${onboardingDaysTone(row.onboardingDays)}`] || ''}`.trim()}>
                        {onboardingDaysLabel(row.onboardingDays)}
                      </span>
                    ) : null}
                    <span className={`${styles.badge} ${toneClass(styles, row.tone)} ${statusVisualClass(row.statusText)}`.trim()}>
                      {row.statusText}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className={styles.pagination}>
              <div className={styles.paginationInfo}>
                Mostrando {pageStart}-{pageEnd} de {filteredRows.length}
              </div>

              <div className={styles.paginationControls}>
                <button
                  type="button"
                  className={styles.paginationButton}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                >
                  Anterior
                </button>

                <span className={styles.paginationCurrent}>
                  Página {page} de {totalPages}
                </span>

                <button
                  type="button"
                  className={styles.paginationButton}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page === totalPages}
                >
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}
        </section>
      ) : null}
    </div>
  );
}
