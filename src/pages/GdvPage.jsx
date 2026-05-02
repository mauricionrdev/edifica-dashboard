import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { getMetric } from '../api/metrics.js';
import { updateGdv } from '../api/gdvs.js';
import { ApiError } from '../api/client.js';
import {
  aggregateCarteira,
  buildPeriodKey,
  calcWeek,
  currentWeek,
} from '../utils/gdvMetrics.js';
import { MONTHS, fmtInt, fmtMoney, fmtPct } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { isAdminUser } from '../utils/roles.js';
import StateBlock from '../components/ui/StateBlock.jsx';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  RotateCcwIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
} from '../components/ui/index.js';
import { filterOperationalClientsForPeriod } from '../utils/operationalClients.js';
import { matchesAnySearch } from '../utils/search.js';
import { CLIENT_STATUS, isActiveClientStatus } from '../utils/clientStatus.js';
import {
  getGdvAvatar,
  readAvatarFile,
  removeGdvAvatar,
  saveGdvAvatar,
  subscribeAvatarChange,
} from '../utils/avatarStorage.js';
import UserPicker from '../components/users/UserPicker.jsx';
import { buildGdvPath, getEntityRouteSegment, matchesEntityRouteSegment, slugifySegment } from '../utils/entityPaths.js';
import styles from './GdvPage.module.css';

const PAGE_SIZE = 10;
const METRIC_BATCH_SIZE = 8;

function displayInt(value) {
  const numeric = Number(value) || 0;
  return numeric === 0 ? '0' : fmtInt(numeric);
}

function displayPct(value) {
  const numeric = Number(value) || 0;
  return numeric === 0 ? '0%' : fmtPct(numeric);
}

function gdvInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'GD';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function clientInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function effectiveForecast(closed, predicted) {
  return Math.max(Number(closed) || 0, Number(predicted) || 0);
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

function statusTone(calc, clientStatus) {
  if (clientStatus === CLIENT_STATUS.CHURN) return 'red';
  if (!isActiveClientStatus(clientStatus)) return 'muted';
  if (!calc?.mLuc) return 'muted';

  const closed = Number(calc.fec) || 0;
  const goal = Number(calc.mLuc) || 0;
  const projected = effectiveForecast(calc.fec, calc.cp);
  const progress = goal > 0 ? (closed / goal) * 100 : 0;

  if (closed >= goal) return 'green';
  if (projected >= goal) return 'amber';
  if (progress >= 55) return 'amber';
  return 'red';
}

function statusLabel(calc, clientStatus) {
  if (clientStatus === CLIENT_STATUS.ONBOARDING) return 'Onboard';
  if (clientStatus === CLIENT_STATUS.PAUSED) return 'Pausado';
  if (clientStatus === CLIENT_STATUS.CHURN) return 'Churn';
  if (!calc?.mLuc) return 'Sem meta';

  const closed = Number(calc.fec) || 0;
  const goal = Number(calc.mLuc) || 0;
  const projected = effectiveForecast(calc.fec, calc.cp);
  const progress = goal > 0 ? (closed / goal) * 100 : 0;

  if (closed >= goal) return 'Meta batida';
  if (projected >= goal) return 'Vai bater';
  if (progress >= 55) return 'Em andamento';
  return 'Crítico';
}

function goalState(calc = {}) {
  const goal = Number(calc.mLuc) || 0;
  const closed = Number(calc.fec) || 0;
  const projected = effectiveForecast(calc.fec, calc.cp);

  if (goal <= 0) {
    return {
      hasGoal: false,
      hit: false,
      forecast: false,
    };
  }

  return {
    hasGoal: true,
    hit: closed >= goal,
    forecast: closed < goal && projected >= goal,
  };
}

function yesNoCard(state, { forecast = false } = {}) {
  if (!state.hasGoal) {
    return {
      value: '—',
      sub: 'Sem meta configurada',
      tone: 'muted',
    };
  }

  if (forecast) {
    return {
      value: state.forecast ? 'Sim' : 'Não',
      sub: state.forecast ? 'Projeção alcança a meta' : 'Projeção abaixo da meta',
      tone: state.forecast ? 'green' : 'muted',
    };
  }

  return {
    value: state.hit ? 'Sim' : 'Não',
    sub: state.hit ? 'Meta já alcançada' : 'Ainda não bateu',
    tone: state.hit ? 'green' : 'muted',
  };
}

function clientPriorityScore(row) {
  if (!row) return -1;
  if (!isActiveClientStatus(row.client?.status)) return 100000;

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

function toneClass(tone) {
  return tone && styles[tone] ? styles[tone] : '';
}

function GdvSettingsModal({ gdv, users = [], busy = false, onClose, onSubmit }) {
  const fileInputRef = useRef(null);
  const [name, setName] = useState(gdv?.name || '');
  const [ownerUserId, setOwnerUserId] = useState(gdv?.ownerUserId || gdv?.owner?.id || '');
  const [logoUrl, setLogoUrl] = useState(getGdvAvatar(gdv));
  const [customSlug, setCustomSlug] = useState(gdv?.customSlug || gdv?.slug || slugifySegment(gdv?.name || ''));

  useEffect(() => {
    setName(gdv?.name || '');
    setOwnerUserId(gdv?.ownerUserId || gdv?.owner?.id || '');
    setLogoUrl(getGdvAvatar(gdv));
    setCustomSlug(gdv?.customSlug || gdv?.slug || slugifySegment(gdv?.name || ''));
  }, [gdv]);

  async function handleLogoFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const dataUrl = await readAvatarFile(file);
    setLogoUrl(dataUrl);
  }

  if (!gdv) return null;

  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="gdv-settings-title" onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHead}>
          <div>
            <span>Configurações</span>
            <h3 id="gdv-settings-title">GDV</h3>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fechar">
            <CloseIcon size={16} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.modalBody}>
          <section className={styles.gdvIdentityPanel}>
            <input ref={fileInputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={handleLogoFile} />
            <button type="button" className={styles.gdvAvatarEditor} onClick={() => fileInputRef.current?.click()}>
              {logoUrl ? <img src={logoUrl} alt="" /> : <span>{gdvInitials(name)}</span>}
            </button>
            <div className={styles.gdvIdentityFields}>
              <label className={styles.modalField}>
                <span>Nome da GDV</span>
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus />
              </label>
              <div className={styles.modalActionsInline}>
                <button type="button" className={styles.modalGhostBtn} onClick={() => fileInputRef.current?.click()}>Alterar avatar</button>
                {logoUrl ? <button type="button" className={styles.modalGhostBtn} onClick={() => setLogoUrl('')}>Remover avatar</button> : null}
              </div>
            </div>
          </section>

          <label className={styles.modalField}>
            <span>Proprietário da GDV</span>
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
              <small>/gdvs/</small>
              <input
                value={customSlug}
                onChange={(event) => setCustomSlug(slugifySegment(event.target.value))}
                maxLength={120}
                placeholder="nome-do-gdv"
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

function IndicatorsModal({ metrics, onClose }) {
  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <section className={styles.indicatorsModal} role="dialog" aria-modal="true" aria-label="Indicadores da carteira" onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHead}>
          <div>
            <span>Carteira GDV</span>
            <h3>Indicadores</h3>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fechar indicadores">
            <CloseIcon size={16} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.indicatorsGrid}>
          {metrics.map((item) => (
            <article key={item.id} className={styles.indicatorsCard}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.sub}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function GdvPage() {
  const {
    clients,
    squads,
    gdvs,
    userDirectory,
    loading: shellLoading,
    refreshClients,
    refreshGdvs,
    setPanelHeader,
  } = useOutletContext();

  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const admin = isAdminUser(user);
  const { gdvId: routeSegment = '' } = useParams();

  const [selectedClientId, setSelectedClientId] = useState(null);
  const [clientQuery, setClientQuery] = useState('');
  const [page, setPage] = useState(1);
  const [logoUrl, setLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [showIndicators, setShowIndicators] = useState(false);

  const cardsRef = useRef(null);

  const [showStickyResult, setShowStickyResult] = useState(false);
  const [renderStickyResult, setRenderStickyResult] = useState(false);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [week, setWeek] = useState(() => currentWeek(now));
  const periodKey = useMemo(() => buildPeriodKey(year, month0, week), [year, month0, week]);

  const [metricsByKey, setMetricsByKey] = useState({});
  const [fetchingKey, setFetchingKey] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const fetchGenRef = useRef(0);
  const loadedMetricsKeyRef = useRef('');
  const inFlightMetricsKeyRef = useRef('');

  const gdvList = Array.isArray(gdvs) ? gdvs : [];
  const cleanRouteSegment = decodeURIComponent(String(routeSegment || '').trim());

  const fallbackRouteName = useMemo(() => {
    if (!cleanRouteSegment) return '';
    const names = Array.from(
      new Set(
        (Array.isArray(clients) ? clients : [])
          .map((client) => String(client?.gdvName || '').trim())
          .filter(Boolean)
      )
    );

    const match = names.find((name) => slugifySegment(name) === slugifySegment(cleanRouteSegment));
    return match || '';
  }, [cleanRouteSegment, clients]);

  const routeGdvRecord = useMemo(() => {
    if (!cleanRouteSegment) return null;

    return gdvList.find((entry) => matchesEntityRouteSegment(cleanRouteSegment, entry))
      || gdvList.find((entry) => String(entry.name || '').trim() === fallbackRouteName)
      || null;
  }, [cleanRouteSegment, fallbackRouteName, gdvList]);

  const routeGdvName = routeGdvRecord?.name || fallbackRouteName || '';
  const invalidGdvRoute = Boolean(cleanRouteSegment) && !shellLoading && !routeGdvName;

  useEffect(() => {
    if (!cleanRouteSegment || !routeGdvName) return;
    const canonicalPath = buildGdvPath(routeGdvRecord || { id: cleanRouteSegment, name: routeGdvName });
    if (canonicalPath !== `/gdvs/${encodeURIComponent(cleanRouteSegment)}`) {
      navigate(canonicalPath, { replace: true });
    }
  }, [cleanRouteSegment, navigate, routeGdvName, routeGdvRecord]);

  const gdvClients = useMemo(() => {
    const base = filterOperationalClientsForPeriod(clients, year, month0).filter(
      (client) => client && client.gdvName && String(client.gdvName).trim().length > 0
    );

    const routeName = String(routeGdvName || '').trim();
    if (routeName) {
      return base.filter((client) => String(client.gdvName || '').trim() === routeName);
    }

    const userName = String(user?.name || '').trim().toLowerCase();
    if (admin) return base;
    if (!userName) return base;

    return base.filter((client) => String(client.gdvName || '').trim().toLowerCase() === userName);
  }, [admin, clients, month0, routeGdvName, user, year]);

  const gdvIdsKey = useMemo(
    () => gdvClients.map((client) => client.id).sort().join('|'),
    [gdvClients]
  );

  useEffect(() => {
    const requestKey = `${periodKey}::${gdvIdsKey}`;

    if (!gdvClients.length) {
      loadedMetricsKeyRef.current = requestKey;
      inFlightMetricsKeyRef.current = '';
      setMetricsByKey((prev) => ({ ...prev, [periodKey]: [] }));
      setFetchingKey(null);
      return undefined;
    }

    const cached = metricsByKey[periodKey];

    if (loadedMetricsKeyRef.current === requestKey && Array.isArray(cached)) {
      const cachedIds = cached.map((entry) => entry.clientId).sort().join('|');
      if (cachedIds === gdvIdsKey && cached.length === gdvClients.length) return undefined;
    }

    if (inFlightMetricsKeyRef.current === requestKey) return undefined;

    const gen = ++fetchGenRef.current;
    const clientsSnapshot = [...gdvClients];
    let cancelled = false;

    inFlightMetricsKeyRef.current = requestKey;
    loadedMetricsKeyRef.current = '';
    setFetchingKey(periodKey);
    setFetchError(null);
    setMetricsByKey((prev) => ({ ...prev, [periodKey]: [] }));

    async function loadMetricsInBatches() {
      const results = [];

      for (let index = 0; index < clientsSnapshot.length; index += METRIC_BATCH_SIZE) {
        if (cancelled || fetchGenRef.current !== gen) return;

        const batch = clientsSnapshot.slice(index, index + METRIC_BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map((client) =>
            getMetric(client.id, periodKey)
              .then((response) => ({ clientId: client.id, metric: response?.metric || null, err: null }))
              .catch((err) => ({ clientId: client.id, metric: null, err }))
          )
        );

        if (cancelled || fetchGenRef.current !== gen) return;

        results.push(...batchResults);
        setMetricsByKey((prev) => ({ ...prev, [periodKey]: [...results] }));
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }

      if (cancelled || fetchGenRef.current !== gen) return;

      const anyAuthErr = results.find(
        (result) => result.err instanceof ApiError && result.err.status === 401
      );
      if (anyAuthErr) {
        inFlightMetricsKeyRef.current = '';
        setFetchingKey(null);
        return;
      }

      const failures = results.filter(
        (result) => result.err && !(result.err instanceof ApiError && result.err.status === 404)
      );
      if (failures.length > 0 && failures.length === results.length) {
        setFetchError(new Error('Falha ao carregar métricas da carteira.'));
      }

      loadedMetricsKeyRef.current = requestKey;
      inFlightMetricsKeyRef.current = '';
      setFetchingKey(null);
    }

    loadMetricsInBatches().catch((err) => {
      if (cancelled || fetchGenRef.current !== gen) return;
      inFlightMetricsKeyRef.current = '';
      setFetchError(err);
      setFetchingKey(null);
    });

    return () => {
      cancelled = true;
    };
  }, [gdvClients, gdvIdsKey, metricsByKey, periodKey]);

  const currentResults = metricsByKey[periodKey] || [];
  const loadingMetrics = fetchingKey === periodKey && currentResults.length === 0;

  const rows = useMemo(() => {
    return gdvClients.map((client) => {
      const entry = currentResults.find((result) => result.clientId === client.id);
      const metric = entry?.metric || { data: {}, computed: {} };
      const calc = calcWeek(metric);
      const weeklyHasGoal = calc.mLuc > 0;
      const weeklyProgress = weeklyHasGoal ? (calc.fec / calc.mLuc) * 100 : 0;
      const weeklyGap = weeklyHasGoal ? Math.max(calc.mLuc - calc.fec, 0) : 0;
      const forecastGap = weeklyHasGoal
        ? Math.max(calc.mLuc - effectiveForecast(calc.fec, calc.cp), 0)
        : 0;

      const row = {
        client,
        metric,
        calc,
        weeklyHasGoal,
        weeklyProgress,
        weeklyGap,
        forecastGap,
        tone: statusTone(calc, client.status),
        statusText: statusLabel(calc, client.status),
      };

      return {
        ...row,
        priorityScore: clientPriorityScore(row),
      };
    });
  }, [currentResults, gdvClients]);

  useEffect(() => {
    if (!selectedClientId) return;
    const exists = rows.some((row) => row.client.id === selectedClientId);
    if (!exists) setSelectedClientId(null);
  }, [rows, selectedClientId]);

  const agg = useMemo(() => aggregateCarteira(rows), [rows]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.client.id === selectedClientId) || null,
    [rows, selectedClientId]
  );

  useEffect(() => {
    if (!selectedRow || !cardsRef.current) {
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
  }, [selectedRow?.client?.id]);

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

  const visibleRows = useMemo(() => {
    const query = clientQuery.trim();
    const base = [...rows].sort((a, b) => {
      const scoreDiff = b.priorityScore - a.priorityScore;
      if (scoreDiff !== 0) return scoreDiff;
      return String(a.client?.name || '').localeCompare(String(b.client?.name || ''), 'pt-BR');
    });

    if (!query) return base;

    return base.filter(({ client }) => matchesAnySearch([client.name, client.squadName, client.gestor], query));
  }, [clientQuery, rows]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [clientQuery, week, month0, year, routeGdvName]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return visibleRows.slice(start, start + PAGE_SIZE);
  }, [page, visibleRows]);

  const pageStart = visibleRows.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const pageEnd = visibleRows.length ? Math.min(page * PAGE_SIZE, visibleRows.length) : 0;

  const gdvDisplayName = useMemo(() => {
    if (routeGdvName) return routeGdvName;
    if (admin) return 'Carteira GDV';
    if (gdvClients.length === 0) return 'Carteira GDV';

    const counts = new Map();
    for (const client of gdvClients) {
      const key = String(client.gdvName).trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    let best = 'Carteira GDV';
    let max = 0;
    for (const [name, total] of counts) {
      if (total > max) {
        best = name;
        max = total;
      }
    }
    return best;
  }, [admin, gdvClients, routeGdvName]);

  const activeGdvRecord = useMemo(() => {
    if (routeGdvRecord) return routeGdvRecord;
    return gdvList.find((entry) => String(entry.name || '').trim() === gdvDisplayName) || null;
  }, [gdvDisplayName, gdvList, routeGdvRecord]);

  useEffect(() => {
    setLogoUrl(getGdvAvatar(activeGdvRecord));
    return subscribeAvatarChange(() => setLogoUrl(getGdvAvatar(activeGdvRecord)));
  }, [activeGdvRecord]);

  const gdvOwnership = useMemo(() => {
    if (activeGdvRecord) {
      return {
        ownerId: activeGdvRecord.ownerUserId || '',
        owner: activeGdvRecord.owner || null,
        active: Boolean(activeGdvRecord.active && activeGdvRecord.owner),
      };
    }

    return {
      ownerId: '',
      owner: null,
      active: false,
    };
  }, [activeGdvRecord]);

  const gdvHeaderName = activeGdvRecord?.name || gdvDisplayName || 'Carteira GDV';
  const gdvHeaderSubtitle = activeGdvRecord || gdvDisplayName !== 'Carteira GDV'
    ? (gdvOwnership.owner?.name
      ? `${gdvOwnership.owner.name} · ${gdvOwnership.active ? 'Ativo' : 'Desativado'}`
      : `Sem proprietário · ${gdvOwnership.active ? 'Ativo' : 'Desativado'}`)
    : 'Selecione um GDV';

  const handlePickLogo = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeGdvRecord?.id) return;

    setUploadingLogo(true);
    try {
      const dataUrl = await readAvatarFile(file);
      const response = await updateGdv(activeGdvRecord.id, {
        name: activeGdvRecord.name,
        ownerUserId: activeGdvRecord.ownerUserId || activeGdvRecord.owner?.id || '',
        logoUrl: dataUrl,
        customSlug: activeGdvRecord.customSlug || activeGdvRecord.slug || '',
      });
      await refreshGdvs?.();
      saveGdvAvatar(response?.gdv || activeGdvRecord, dataUrl);
      setLogoUrl(dataUrl);
      showToast('Imagem do GDV atualizada.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível carregar a imagem.', { variant: 'error' });
    } finally {
      setUploadingLogo(false);
    }
  }, [activeGdvRecord, refreshGdvs, showToast]);

  const handleRemoveLogo = useCallback(async () => {
    if (!activeGdvRecord?.id) return;

    try {
      await updateGdv(activeGdvRecord.id, {
        name: activeGdvRecord.name,
        ownerUserId: activeGdvRecord.ownerUserId || activeGdvRecord.owner?.id || '',
        logoUrl: '',
        customSlug: activeGdvRecord.customSlug || activeGdvRecord.slug || '',
      });
      await refreshGdvs?.();
      removeGdvAvatar(activeGdvRecord);
      setLogoUrl('');
      showToast('Imagem do GDV removida.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível remover a imagem.', { variant: 'error' });
    }
  }, [activeGdvRecord, refreshGdvs, showToast]);

  const handleSaveGdvSettings = useCallback(async ({ name, ownerUserId, logoUrl: nextLogoUrl, customSlug }) => {
    if (!activeGdvRecord?.id) return;
    setSettingsSaving(true);

    try {
      const nextName = String(name || '').trim();
      const response = await updateGdv(activeGdvRecord.id, {
        name: nextName,
        ownerUserId: ownerUserId || '',
        logoUrl: nextLogoUrl || '',
        customSlug: customSlug || '',
      });

      if (nextLogoUrl) saveGdvAvatar({ ...activeGdvRecord, ...response?.gdv, name: nextName }, nextLogoUrl);
      else removeGdvAvatar(activeGdvRecord);

      setLogoUrl(nextLogoUrl || '');
      await Promise.all([refreshGdvs?.(), refreshClients?.()]);
      setSettingsOpen(false);

      const savedGdv = response?.gdv || { ...activeGdvRecord, name: nextName, customSlug };
      if (cleanRouteSegment) navigate(buildGdvPath(savedGdv, nextName), { replace: true });

      showToast('GDV atualizado.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível atualizar o GDV.', { variant: 'error' });
    } finally {
      setSettingsSaving(false);
    }
  }, [activeGdvRecord, cleanRouteSegment, navigate, refreshClients, refreshGdvs, showToast]);

  const complementaryMetrics = useMemo(() => {
    const activeRows = rows.filter((row) => isActiveClientStatus(row.client?.status));
    const onboardingRows = rows.filter((row) => row.client?.status === CLIENT_STATUS.ONBOARDING);
    const pausedRows = rows.filter((row) => row.client?.status === CLIENT_STATUS.PAUSED);

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
      { id: 'contracts', label: 'Bateram meta contratos', value: `${displayInt(hitContracts.length)} de ${displayInt(activeTotal)}`, sub: 'meta contratos' },
      { id: 'profit', label: 'Bateram meta lucro', value: `${displayInt(hitProfit.length)} de ${displayInt(activeTotal)}`, sub: 'meta lucro' },
      { id: 'below', label: 'Abaixo da meta', value: `${displayInt(belowGoal.length)} de ${displayInt(activeTotal)}`, sub: 'clientes ativos' },
      { id: 'onboarding', label: 'Onboarding', value: displayInt(onboardingRows.length), sub: 'fora da meta' },
      { id: 'paused', label: 'Pausados', value: displayInt(pausedRows.length), sub: 'fora da meta' },
    ];
  }, [rows]);

  const topCards = useMemo(() => {
    if (selectedRow) {
      const { calc } = selectedRow;
      const prediction = predictionCard(calc.fec, calc.cp, calc.mLuc);

      return [
        {
          id: 'closed',
          label: 'Contratos fechados',
          value: displayInt(calc.fec),
          sub: `Semana ${week}`,
          tone: 'neutral',
        },
        {
          id: 'profitGoal',
          label: 'Meta de lucro',
          value: calc.mLuc > 0 ? displayInt(calc.mLuc) : '—',
          sub: calc.mLuc > 0 ? `${displayInt(selectedRow.weeklyGap)} para bater` : 'Sem meta configurada',
          tone: calc.mLuc > 0 ? 'neutral' : 'muted',
        },
        {
          id: 'predictedContracts',
          label: 'Contratos previstos',
          value: calc.cp > 0 ? displayInt(calc.cp) : '0',
          sub: prediction.sub,
          tone: prediction.tone,
        },
        {
          id: 'conversion',
          label: 'Taxa de conversão',
          value: calc.taxa > 0 ? displayPct(calc.taxa) : '—',
          sub: calc.vol > 0 ? `${displayInt(calc.vol)} leads reais` : '',
          tone: calc.taxa > 0 ? 'neutral' : 'muted',
        },
        {
          id: 'forecastGoal',
          label: 'Previsto bater meta',
          ...yesNoCard(goalState(calc), { forecast: true }),
        },
        {
          id: 'hitGoal',
          label: 'Já bateu meta',
          ...yesNoCard(goalState(calc)),
        },
      ];
    }

    return [
      { id: 'closed', label: 'Contratos fechados', value: '0', sub: `Semana ${week}`, tone: 'muted' },
      { id: 'profitGoal', label: 'Meta de lucro', value: '0', sub: '', tone: 'muted' },
      { id: 'predictedContracts', label: 'Contratos previstos', value: '0', sub: '', tone: 'muted' },
      { id: 'conversion', label: 'Taxa de conversão', value: '—', sub: '', tone: 'muted' },
      { id: 'forecastGoal', label: 'Previsto bater meta', value: '—', sub: '', tone: 'muted' },
      { id: 'hitGoal', label: 'Já bateu meta', value: '—', sub: '', tone: 'muted' },
    ];
  }, [selectedRow, week]);

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
    const title = (
      <div className={styles.headerIdentity}>
        <button
          type="button"
          className={styles.headerLogo}
          onClick={() => admin && activeGdvRecord?.id && setSettingsOpen(true)}
          disabled={!admin || !activeGdvRecord?.id || uploadingLogo}
          aria-label={admin && activeGdvRecord?.id ? 'Configurar GDV' : undefined}
          title={admin && activeGdvRecord?.id ? 'Configurar GDV' : gdvHeaderName}
        >
          {logoUrl ? <img src={logoUrl} alt="" /> : <span>{gdvInitials(gdvHeaderName)}</span>}
          {admin && activeGdvRecord?.id ? <em>Configurar</em> : null}
        </button>

        <input
          type="file"
          accept="image/*"
          className={styles.hiddenInput}
          onChange={handlePickLogo}
        />

        <div className={styles.headerTitleText}>
          <strong>{gdvHeaderName}</strong>
          <small>{gdvHeaderSubtitle}</small>
        </div>
      </div>
    );

    const actions = (
      <div className={styles.headerActions}>
        <div className={styles.headerCard}>
          <span className={styles.headerCardLabel}>Carteira</span>
          <span className={styles.headerStat} title={displayInt(gdvClients.length)}>
            <UsersIcon size={15} aria-hidden="true" />
            <strong>{displayInt(gdvClients.length)}</strong>
          </span>
        </div>

        <div className={styles.headerCard}>
          <span className={styles.headerCardLabel}>Período</span>
          <div className={styles.monthNav}>
            <button type="button" className={styles.navBtn} onClick={prevMonth} aria-label="Mês anterior">
              <ChevronLeftIcon size={15} aria-hidden="true" />
            </button>
            <div className={styles.monthLabel}>{MONTHS[month0]} {year}</div>
            <button type="button" className={styles.navBtn} onClick={nextMonth} aria-label="Próximo mês">
              <ChevronRightIcon size={15} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className={styles.headerCard}>
          <span className={styles.headerCardLabel}>Semana</span>
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

        <div className={styles.headerCard}>
          <span className={styles.headerCardLabel}>Ações</span>
          <div className={styles.headerUtilityRow}>
            {admin && activeGdvRecord?.id ? (
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Configurar GDV"
                title="Configurar GDV"
                onClick={() => setSettingsOpen(true)}
              >
                <SettingsIcon size={14} aria-hidden="true" />
              </button>
            ) : null}


            <button
              type="button"
              className={styles.iconButton}
              aria-label="Atualizar visão"
              title="Atualizar visão"
              onClick={() => {
                refreshGdvs?.();
                refreshClients?.();
                setMetricsByKey((prev) => {
                  const next = { ...prev };
                  delete next[periodKey];
                  return next;
                });
              }}
            >
              <RotateCcwIcon size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    );

    setPanelHeader({ title, actions });
  }, [
    activeGdvRecord,
    admin,
    gdvClients.length,
    gdvHeaderName,
    gdvHeaderSubtitle,
    handlePickLogo,
    logoUrl,
    month0,
    nextMonth,
    periodKey,
    prevMonth,
    refreshClients,
    refreshGdvs,
    setPanelHeader,
    uploadingLogo,
    week,
    year,
  ]);

  if (shellLoading && (!clients || clients.length === 0)) {
    return <div className={styles.page}><StateBlock variant="loading" title="Carregando carteira GDV" /></div>;
  }

  if (invalidGdvRoute) {
    return <div className={styles.page}><StateBlock variant="error" title="GDV não encontrado" /></div>;
  }

  if (!gdvClients.length) {
    return <div className={styles.page}><StateBlock variant="empty" title="Carteira vazia" /></div>;
  }

  return (
    <div className={styles.page}>
      {settingsOpen ? (
        <GdvSettingsModal
          gdv={activeGdvRecord}
          users={Array.isArray(userDirectory) ? userDirectory : []}
          busy={settingsSaving}
          onClose={() => setSettingsOpen(false)}
          onSubmit={handleSaveGdvSettings}
        />
      ) : null}

      {showIndicators ? (
        <IndicatorsModal metrics={complementaryMetrics} onClose={() => setShowIndicators(false)} />
      ) : null}

      {selectedRow && renderStickyResult ? (
        <section className={`${styles.stickyResultBar} ${showStickyResult ? styles.stickyVisible : styles.stickyLeaving}`.trim()}>
          <span className={styles.clientAvatarMini}>{clientInitials(selectedRow.client.name)}</span>
          <strong>{selectedRow.client.name}</strong>

          <div className={styles.stickyMetric}><span>Fechados</span><b>{displayInt(selectedRow.calc.fec)}</b></div>
          <div className={styles.stickyMetric}><span>Meta</span><b>{selectedRow.calc.mLuc > 0 ? displayInt(selectedRow.calc.mLuc) : '—'}</b></div>
          <div className={styles.stickyMetric}><span>Gap</span><b>{selectedRow.calc.mLuc > 0 ? displayInt(selectedRow.weeklyGap) : '—'}</b></div>

          <span className={`${styles.badge} ${toneClass(selectedRow.tone)}`.trim()}>{selectedRow.statusText}</span>
          <button type="button" className={styles.clearSelectionMini} onClick={() => setSelectedClientId(null)}>Limpar</button>
        </section>
      ) : null}

      <section ref={cardsRef} className={styles.metricGrid}>
        {topCards.map((item) => (
          <article key={item.id} className={styles.metricCard}>
            <span className={styles.metricLabel}>{item.label}</span>
            <strong className={`${styles.metricValue} ${toneClass(item.tone)}`.trim()}>{item.value}</strong>
            <span className={`${styles.metricSub} ${toneClass(item.tone)}`.trim()}>{item.sub}</span>
          </article>
        ))}
      </section>

      <section className={styles.listToolbar}>
        <div className={styles.toolbarControls}>
          <label className={styles.searchBox}>
            <SearchIcon size={15} aria-hidden="true" />
            <input
              type="search"
              value={clientQuery}
              onChange={(event) => setClientQuery(event.target.value)}
              placeholder="Buscar cliente, squad ou gestor..."
              aria-label="Buscar cliente da carteira GDV"
            />
          </label>

          <button
            type="button"
            className={`${styles.complementaryButton} ${showIndicators ? styles.complementaryButtonActive : ''}`.trim()}
            onClick={() => setShowIndicators(true)}
            aria-expanded={showIndicators}
          >
            <span>Indicadores da carteira</span>
          </button>
        </div>
      </section>

      <section className={styles.listCard}>
        {fetchError ? (
          <StateBlock variant="error" compact title="Métricas indisponíveis" />
        ) : visibleRows.length === 0 && loadingMetrics ? (
          <StateBlock variant="loading" compact title="Carregando métricas" />
        ) : visibleRows.length === 0 ? (
          <StateBlock variant="empty" compact title="Nenhum cliente encontrado" />
        ) : (
          <>
            <div className={styles.clientList}>
              {pagedRows.map((row) => {
                const { client, calc } = row;
                const squadName =
                  (squads || []).find((squad) => squad.id === client.squadId)?.name || client.squadName || 'Sem squad';
                const active = selectedClientId === client.id;

                return (
                  <button
                    key={client.id}
                    type="button"
                    className={`${styles.clientRow} ${active ? styles.clientRowActive : ''}`.trim()}
                    onClick={() => setSelectedClientId(client.id)}
                  >
                    <div className={styles.clientMain}>
                      <span className={styles.clientAvatarSmall}>{clientInitials(client.name)}</span>
                      <div>
                        <strong>{client.name}</strong>
                        <span>{squadName}{client.gestor ? ` · ${client.gestor}` : ''}</span>
                      </div>
                    </div>

                    <div className={styles.clientStats}>
                      <div>
                        <span>Mensalidade</span>
                        <strong>{fmtMoney(client.monthlyFee || client.mensalidade || client.fee || 0)}</strong>
                      </div>
                      <div>
                        <span>Fechados</span>
                        <strong>{displayInt(calc.fec)}</strong>
                      </div>
                    </div>

                    <div className={styles.clientStatus}>
                      <span className={`${styles.badge} ${toneClass(row.tone)}`.trim()}>{row.statusText}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className={styles.pagination}>
              <div className={styles.paginationInfo}>Mostrando {pageStart}-{pageEnd} de {visibleRows.length}</div>
              <div className={styles.paginationControls}>
                <button
                  type="button"
                  className={styles.paginationButton}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                >
                  Anterior
                </button>
                <span className={styles.paginationCurrent}>Página {page} de {totalPages}</span>
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
