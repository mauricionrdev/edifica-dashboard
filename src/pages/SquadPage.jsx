import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { updateSquad } from '../api/squads.js';
import { getMetric } from '../api/metrics.js';
import { ApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  CloseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RotateCcwIcon,
  SearchIcon,
  Select,
  LoadingIcon,
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
  buildPeriodKey,
  calcWeek,
  currentWeek,
} from '../utils/gdvMetrics.js';
import { filterOperationalClientsForPeriod } from '../utils/operationalClients.js';
import {
  getSquadAvatar,
  readAvatarFile,
  removeSquadAvatar,
  saveSquadAvatar,
  subscribeAvatarChange,
} from '../utils/avatarStorage.js';
import { matchesAnySearch } from '../utils/search.js';
import { CLIENT_STATUS, isActiveClientStatus } from '../utils/clientStatus.js';
import UserPicker from '../components/users/UserPicker.jsx';
import { buildSquadPath, matchesEntityRouteSegment, slugifySegment } from '../utils/entityPaths.js';
import styles from './SquadPage.module.css';

const PAGE_SIZE = 10;

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

function effectiveForecast(closed, predicted) {
  return Math.max(Number(closed) || 0, Number(predicted) || 0);
}

function statusTone(calc, status) {
  if (status === CLIENT_STATUS.CHURN) return 'red';
  if (!isActiveClientStatus(status)) return 'muted';
  if (!calc?.mLuc) return 'muted';

  const progress = (calc.fec / calc.mLuc) * 100;
  if (calc.fec >= calc.mLuc) return 'green';
  if (effectiveForecast(calc.fec, calc.cp) >= calc.mLuc) return 'amber';
  if (progress >= 55) return 'amber';
  return 'red';
}

function statusLabel(calc, status) {
  if (status === CLIENT_STATUS.ONBOARDING) return 'Onboard';
  if (status === CLIENT_STATUS.PAUSED) return 'Pausado';
  if (status === CLIENT_STATUS.CHURN) return 'Churn';
  if (!calc?.mLuc) return 'Sem meta';
  if (calc.fec >= calc.mLuc) return 'Meta batida';
  if (effectiveForecast(calc.fec, calc.cp) >= calc.mLuc) return 'Vai bater';
  if ((calc.fec / calc.mLuc) * 100 >= 55) return 'Em andamento';
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

function clientPriorityScore(row) {
  if (!row) return -1;
  if (!isActiveClientStatus(row.status)) return 100000;

  const calc = row.calc || {};
  const goal = Number(calc.mLuc) || 0;
  const closed = Number(calc.fec) || 0;
  const predicted = Number(calc.cp) || 0;
  const projected = effectiveForecast(closed, predicted);
  const gap = goal > 0 ? Math.max(goal - closed, 0) : 0;
  const forecastGap = goal > 0 ? Math.max(goal - projected, 0) : 0;
  const progress = goal > 0 ? (closed / goal) * 100 : 0;

  if (!goal) return 100;
  if (closed >= goal) return 0;
  if (projected >= goal) return 3000 + gap * 20 + Math.max(0, 100 - progress);

  return 6000 + forecastGap * 60 + gap * 20 + Math.max(0, 100 - progress);
}

function initialsFromClient(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}


function SquadSettingsModal({ squad, users = [], busy = false, onClose, onSubmit }) {
  const fileInputRef = useRef(null);
  const [name, setName] = useState(squad?.name || '');
  const [ownerUserId, setOwnerUserId] = useState(squad?.ownerUserId || squad?.owner?.id || '');
  const [logoUrl, setLogoUrl] = useState(getSquadAvatar(squad));
  const [customSlug, setCustomSlug] = useState(squad?.customSlug || squad?.slug || slugifySegment(squad?.name || ''));

  useEffect(() => {
    setName(squad?.name || '');
    setOwnerUserId(squad?.ownerUserId || squad?.owner?.id || '');
    setLogoUrl(getSquadAvatar(squad));
    setCustomSlug(squad?.customSlug || squad?.slug || slugifySegment(squad?.name || ''));
  }, [squad]);

  async function handleLogoFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const dataUrl = await readAvatarFile(file);
    setLogoUrl(dataUrl);
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
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className={styles.modalBody}>
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
            onClick={() => onSubmit({ name, ownerUserId, logoUrl, customSlug })}
            disabled={busy || !name.trim()}
          >
            {busy ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
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

  useEffect(() => {
    if (!squad?.id || !squadId) return;
    const current = `/squads/${encodeURIComponent(String(squadId))}`;
    const canonical = buildSquadPath(squad);
    if (current !== canonical) navigate(canonical, { replace: true });
  }, [navigate, squad, squadId]);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [week, setWeek] = useState(() => currentWeek(now));
  const [query, setQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [page, setPage] = useState(1);
  const [logoUrl, setLogoUrl] = useState(() => getSquadAvatar(squad));
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [ownershipTick, setOwnershipTick] = useState(0);
  const [metricsByKey, setMetricsByKey] = useState({});
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(null);
  const metricsFetchRef = useRef(0);
  const logoInputRef = useRef(null);
  const cardsRef = useRef(null);
  const [showStickyResult, setShowStickyResult] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showComplementaryMetrics, setShowComplementaryMetrics] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [renderStickyResult, setRenderStickyResult] = useState(false);

  const periodKey = useMemo(() => buildPeriodKey(year, month0, week), [year, month0, week]);

  const squadClients = useMemo(
    () =>
      filterOperationalClientsForPeriod(clients, year, month0).filter(
        (client) => client?.squadId === resolvedSquadId
      ),
    [clients, month0, resolvedSquadId, year]
  );

  useEffect(() => {
    setLogoUrl(getSquadAvatar(squad));
    return subscribeAvatarChange(() => setLogoUrl(getSquadAvatar(squad)));
  }, [squad]);

  useEffect(() => subscribeOwnershipChange(() => setOwnershipTick((current) => current + 1)), []);

  const squadOwnership = useMemo(
    () => resolveSquadOwner(squad, userDirectory),
    [ownershipTick, squad, userDirectory]
  );

  useEffect(() => {
    if (!squadClients.length) {
      setMetricsByKey((prev) => ({ ...prev, [periodKey]: [] }));
      return;
    }

    const clientIds = squadClients.map((client) => client.id).sort().join('|');
    const cached = metricsByKey[periodKey];

    if (Array.isArray(cached)) {
      const cachedIds = cached.map((entry) => entry.clientId).sort().join('|');
      if (cachedIds === clientIds) return;
    }

    const gen = ++metricsFetchRef.current;
    setMetricsLoading(true);
    setMetricsError(null);

    Promise.all(
      squadClients.map((client) =>
        getMetric(client.id, periodKey)
          .then((response) => ({ clientId: client.id, metric: response?.metric || null, err: null }))
          .catch((err) => ({ clientId: client.id, metric: null, err }))
      )
    )
      .then((results) => {
        if (metricsFetchRef.current !== gen) return;

        const anyAuthError = results.find(
          (result) => result.err instanceof ApiError && result.err.status === 401
        );
        if (anyAuthError) return;

        setMetricsByKey((prev) => ({ ...prev, [periodKey]: results }));

        const failures = results.filter(
          (result) => result.err && !(result.err instanceof ApiError && result.err.status === 404)
        );

        if (failures.length > 0 && failures.length === results.length) {
          setMetricsError(new Error('Falha ao carregar métricas operacionais do squad.'));
        }
      })
      .finally(() => {
        if (metricsFetchRef.current === gen) setMetricsLoading(false);
      });
  }, [metricsByKey, periodKey, squadClients]);

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
    async ({ name, ownerUserId, logoUrl: nextLogoUrl, customSlug }) => {
      if (!squad || !canManageSquads) return;
      setSettingsSaving(true);
      try {
        await updateSquad(squad.id, {
          name: String(name || '').trim(),
          ownerUserId: ownerUserId || '',
          logoUrl: nextLogoUrl || '',
          customSlug: customSlug || '',
        });
        await refreshSquads?.();
        if (nextLogoUrl) {
          saveSquadAvatar(squad, nextLogoUrl);
        } else {
          removeSquadAvatar(squad);
        }
        setLogoUrl(nextLogoUrl || '');
        setSettingsOpen(false);
        setOwnershipTick((current) => current + 1);
        showToast('Squad atualizado.', { variant: 'success' });
      } catch (err) {
        showToast(err?.message || 'Não foi possível atualizar o squad.', { variant: 'error' });
      } finally {
        setSettingsSaving(false);
      }
    },
    [canManageSquads, refreshSquads, showToast, squad]
  );


  const metricRows = metricsByKey[periodKey] || [];

  const clientRows = useMemo(() => {
    return squadClients.map((client) => {
      const metricEntry = metricRows.find((row) => row.clientId === client.id);
      const metric = metricEntry?.metric || { data: {}, computed: {} };
      const calc = calcWeek(metric);
      const weeklyHasGoal = calc.mLuc > 0;
      const weeklyProgress = weeklyHasGoal ? (calc.fec / calc.mLuc) * 100 : 0;
      const weeklyGap = weeklyHasGoal ? Math.max(calc.mLuc - calc.fec, 0) : 0;
      const forecastGap = weeklyHasGoal
        ? Math.max(calc.mLuc - effectiveForecast(calc.fec, calc.cp), 0)
        : 0;
      const tone = statusTone(calc, client.status);
      const statusText = statusLabel(calc, client.status);

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
      };

      return {
        ...row,
        priorityScore: clientPriorityScore(row),
      };
    });
  }, [metricRows, squadClients]);


  const complementaryMetrics = useMemo(() => {
    const activeRows = clientRows.filter((row) => isActiveClientStatus(row.status));
    const onboardingRows = clientRows.filter((row) => row.status === CLIENT_STATUS.ONBOARDING);
    const pausedRows = clientRows.filter((row) => row.status === CLIENT_STATUS.PAUSED);

    const hitContracts = activeRows.filter((row) => {
      const closed = Number(row.calc?.fec) || 0;
      const target = Number(row.calc?.mEmp) || 0;
      return target > 0 && closed >= target;
    });

    const hitProfit = activeRows.filter((row) => {
      const closed = Number(row.calc?.fec) || 0;
      const target = Number(row.calc?.mLuc) || 0;
      return target > 0 && closed >= target;
    });

    const belowGoal = activeRows.filter((row) => {
      const closed = Number(row.calc?.fec) || 0;
      const contractTarget = Number(row.calc?.mEmp) || 0;
      const profitTarget = Number(row.calc?.mLuc) || 0;

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
      const scoreDiff = b.priorityScore - a.priorityScore;
      if (scoreDiff !== 0) return scoreDiff;
      return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    });

    if (!normalized) return base;
    return base.filter((row) => matchesAnySearch([row.name, row.gestor, row.gdvName], normalized));
  }, [clientRows, query]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

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
          onClick={() => canManageSquads && logoInputRef.current?.click()}
          disabled={!canManageSquads || uploadingLogo}
          aria-label={canManageSquads ? 'Enviar logotipo do squad' : undefined}
          title={canManageSquads ? 'Clique para trocar o logotipo' : squad.name}
        >
          {logoUrl ? <img src={logoUrl} alt="" /> : <span>{squadInitials(squad.name)}</span>}
          {canManageSquads ? (
            <em>{uploadingLogo ? <LoadingIcon size="xs" label="Atualizando avatar" /> : 'Trocar'}</em>
          ) : null}
        </button>

        <div className={styles.headerTitleText}>
          <strong>{squad.name}</strong>
          <small>{squadOwnership.active ? 'Ativo' : 'Desativado'}</small>
        </div>
      </div>
    );

    const actions = (
      <div className={styles.headerActions}>
        <div className={styles.headerCluster}>
          <span className={styles.headerStat}>
            <UsersIcon size={15} aria-hidden="true" />
            <strong>{displayInt(squadClients.length)}</strong>
            <small>{squadClients.length === 1 ? 'cliente' : 'clientes'}</small>
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
          {canManageSquads ? (
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
    canManageSquads,
    logoUrl,
    metricsLoading,
    month0,
    nextMonth,
    prevMonth,
    refreshClients,
    setPanelHeader,
    squad,
    squadClients.length,
    squadOwnership.active,
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
          value: selectedClient.calc.mLuc > 0 ? displayInt(selectedClient.calc.mLuc) : '—',
          sub:
            selectedClient.calc.mLuc > 0
              ? `${displayInt(selectedClient.weeklyGap)} para bater`
              : 'Sem meta configurada',
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

    return [
      {
        id: 'closed',
        label: 'Contratos fechados',
        value: '0',
        sub: `Semana ${week}`,
        tone: 'muted',
      },
      {
        id: 'profitGoal',
        label: 'Meta de lucro',
        value: '0',
        sub: 'Selecione um cliente',
        tone: 'muted',
      },
      {
        id: 'predictedContracts',
        label: 'Contratos previstos',
        value: '0',
        sub: 'Selecione um cliente',
        tone: 'muted',
      },
      {
        id: 'conversion',
        label: 'Taxa de conversão',
        value: '—',
        sub: 'Selecione um cliente',
        tone: 'muted',
      },
      {
        id: 'cpl',
        label: 'CPL atual',
        value: '—',
        sub: 'Selecione um cliente',
        tone: 'muted',
      },
      {
        id: 'leads',
        label: 'Leads previstos',
        value: '0',
        sub: 'Selecione um cliente',
        tone: 'muted',
      },
    ];
  }, [selectedClient, week]);

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
          onClose={() => setSettingsOpen(false)}
          onSubmit={handleSaveSquadSettings}
        />
      ) : null}

      {false && selectedClient && renderStickyResult ? (
        <section className={`${styles.stickyResultBar} ${showStickyResult ? styles.stickyVisible : styles.stickyLeaving}`.trim()}>
          <span className={styles.clientAvatarMini}>{selectedClient.avatarUrl ? <img src={selectedClient.avatarUrl} alt="" /> : initialsFromClient(selectedClient.name)}</span>
          <strong>{selectedClient.name}</strong>

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

          <span className={`${styles.badge} ${toneClass(styles, selectedClient.tone)}`.trim()}>
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

            <button
              type="button"
              className={`${styles.complementaryButton} ${showComplementaryMetrics ? styles.complementaryButtonActive : ''}`.trim()}
              onClick={() => setShowComplementaryMetrics((open) => !open)}
              aria-expanded={showComplementaryMetrics}
            >
              <span>Indicadores da carteira</span>
            </button>
          </div>
        </section>
      </section>

      {showComplementaryMetrics ? (
        <>
          <button
            type="button"
            className={styles.drawerScrim}
            onClick={() => setShowComplementaryMetrics(false)}
            aria-label="Fechar indicadores"
          />
          <section className={styles.complementaryDrawer} role="dialog" aria-modal="true" aria-label="Indicadores da carteira">
            <div className={styles.complementaryHead}>
              <strong>Indicadores</strong>
              <button type="button" className={styles.drawerClose} onClick={() => setShowComplementaryMetrics(false)} aria-label="Fechar indicadores">
                <CloseIcon size={14} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.complementaryList}>
              {complementaryMetrics.map((item) => (
                <article key={item.id} className={styles.complementaryMetricCard}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <section className={styles.listCard}>
        {metricsError ? (
          <StateBlock variant="warning" compact title="Métricas indisponíveis" />
        ) : filteredRows.length === 0 ? (
          <StateBlock variant="empty" compact title="Nenhum cliente encontrado" />
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
                    <span className={`${styles.badge} ${toneClass(styles, row.tone)}`.trim()}>
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
    </div>
  );
}
