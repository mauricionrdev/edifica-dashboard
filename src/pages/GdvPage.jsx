import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
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
import { isAdminUser, isSuperAdmin, roleLabel } from '../utils/roles.js';
import StateBlock from '../components/ui/StateBlock.jsx';
import LoadingIcon from '../components/ui/LoadingIcon.jsx';
import { CloseIcon, RotateCcwIcon, SearchIcon, Select, UsersIcon } from '../components/ui/index.js';
import { filterOperationalClientsForPeriod } from '../utils/operationalClients.js';
import { matchesAnySearch } from '../utils/search.js';
import {
  getGdvAvatar,
  readAvatarFile,
  removeGdvAvatar,
  saveGdvAvatar,
  subscribeAvatarChange,
} from '../utils/avatarStorage.js';
import UserPicker from '../components/users/UserPicker.jsx';
import UserHoverCard from '../components/users/UserHoverCard.jsx';
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

function statusTone(calc, clientStatus) {
  if (clientStatus === 'churn') return 'red';
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
  if (clientStatus === 'churn') return 'Churn';
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

function clientPriorityScore(row) {
  if (!row) return -1;
  if (row.client?.status === 'churn') return 100000;

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

export default function GdvPage() {
  const {
    clients,
    squads,
    gdvs,
    userDirectory,
    loading: shellLoading,
    refreshGdvs,
    setPanelHeader,
  } = useOutletContext();

  const { user } = useAuth();
  const { showToast } = useToast();

  const admin = isAdminUser(user);
  const superAdmin = isSuperAdmin(user);
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedGdv, setSelectedGdv] = useState('');
  const [gdvMenuOpen, setGdvMenuOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [clientQuery, setClientQuery] = useState('');
  const [page, setPage] = useState(1);

  const [logoUrl, setLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const gdvMenuRef = useRef(null);
  const gdvLogoInputRef = useRef(null);
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

  const gdvOptions = useMemo(() => {
    const names = new Set(
      (clients || []).map((client) => String(client?.gdvName || '').trim()).filter(Boolean)
    );

    (Array.isArray(gdvs) ? gdvs : []).forEach((entry) => {
      if (entry?.active !== false && entry?.name) names.add(String(entry.name).trim());
    });

    (Array.isArray(userDirectory) ? userDirectory : []).forEach((entry) => {
      const secondary = Array.isArray(entry?.secondaryRoles) ? entry.secondaryRoles : [];
      if (entry?.active !== false && (entry?.role === 'gdv' || secondary.includes('gdv')) && entry?.name) {
        names.add(String(entry.name).trim());
      }
    });

    return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [clients, gdvs, userDirectory]);

  useEffect(() => {
    const fromUrl = searchParams.get('gdv') || '';
    setSelectedGdv((current) => (current === fromUrl ? current : fromUrl));
  }, [searchParams]);

  const gdvClients = useMemo(() => {
    const base = filterOperationalClientsForPeriod(clients, year, month0).filter(
      (client) => client && client.gdvName && String(client.gdvName).trim().length > 0
    );

    const userName = String(user?.name || '').trim().toLowerCase();

    if (admin) {
      if (!selectedGdv) return base;
      return base.filter((client) => String(client.gdvName || '').trim() === selectedGdv);
    }

    if (!userName) return base;

    return base.filter(
      (client) => String(client.gdvName || '').trim().toLowerCase() === userName
    );
  }, [admin, clients, month0, selectedGdv, user, year]);

  const gdvIdsKey = useMemo(
    () => gdvClients.map((client) => client.id).sort().join('|'),
    [gdvClients]
  );

  useEffect(() => {
    if (!gdvMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (gdvMenuRef.current?.contains(event.target)) return;
      setGdvMenuOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setGdvMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [gdvMenuOpen]);

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

    if (inFlightMetricsKeyRef.current === requestKey) {
      return undefined;
    }

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
  }, [gdvIdsKey, periodKey]);

  const currentResults = metricsByKey[periodKey] || [];
  const loadingMetrics = fetchingKey === periodKey && currentResults.length === 0;
  const loadingMetricsPartial = fetchingKey === periodKey && currentResults.length > 0;

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

    return base.filter(({ client }) =>
      matchesAnySearch([client.name, client.squadName, client.gestor], query)
    );
  }, [clientQuery, rows]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [clientQuery, week, month0, year, selectedGdv]);

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
    if (admin) return selectedGdv || 'Carteira GDV';
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
  }, [admin, gdvClients, selectedGdv]);

  const activeGdvName = useMemo(() => {
    if (admin) return selectedGdv || '';
    return gdvDisplayName === 'Carteira GDV' ? '' : gdvDisplayName;
  }, [admin, gdvDisplayName, selectedGdv]);

  const activeGdvRecord = useMemo(
    () => (Array.isArray(gdvs) ? gdvs : []).find((entry) => entry.name === activeGdvName) || null,
    [activeGdvName, gdvs]
  );

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

  const gdvHeaderName = useMemo(() => {
    if (!activeGdvName) return 'Carteira GDV';
    return activeGdvName;
  }, [activeGdvName]);

  const gdvHeaderSubtitle = useMemo(() => {
    if (!activeGdvName) return 'Todos os GDVs';
    return gdvOwnership.owner?.name
      ? `${gdvOwnership.owner.name} · ${gdvOwnership.active ? 'Ativo' : 'Desativado'}`
      : `Sem proprietário · ${gdvOwnership.active ? 'Ativo' : 'Desativado'}`;
  }, [activeGdvName, gdvOwnership.active, gdvOwnership.owner?.name]);

  const handlePickLogo = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';

      if (!file || !activeGdvRecord?.id) return;

      setUploadingLogo(true);

      try {
        const dataUrl = await readAvatarFile(file);

        await updateGdv(activeGdvRecord.id, {
          name: activeGdvRecord.name,
          ownerUserId: activeGdvRecord.ownerUserId || activeGdvRecord.owner?.id || '',
          logoUrl: dataUrl,
        });

        await refreshGdvs?.();

        const saved = saveGdvAvatar(activeGdvRecord, dataUrl) || true;

        if (!saved) throw new Error('Não foi possível salvar a imagem do GDV.');

        setLogoUrl(dataUrl);
        showToast('Imagem do GDV atualizada.', { variant: 'success' });
      } catch (err) {
        showToast(err?.message || 'Não foi possível carregar a imagem.', { variant: 'error' });
      } finally {
        setUploadingLogo(false);
      }
    },
    [activeGdvRecord, refreshGdvs, showToast]
  );

  const handleRemoveLogo = useCallback(async () => {
    if (!activeGdvRecord?.id) return;

    try {
      await updateGdv(activeGdvRecord.id, {
        name: activeGdvRecord.name,
        ownerUserId: activeGdvRecord.ownerUserId || activeGdvRecord.owner?.id || '',
        logoUrl: '',
      });

      await refreshGdvs?.();

      removeGdvAvatar(activeGdvRecord);
      setLogoUrl('');

      showToast('Imagem do GDV removida.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível remover a imagem.', { variant: 'error' });
    }
  }, [activeGdvRecord, refreshGdvs, showToast]);

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
          id: 'cpl',
          label: 'CPL atual',
          value: calc.cpl > 0 ? fmtMoney(calc.cpl) : '—',
          sub: goalComparison(calc.cpl, calc.mCpl, {
            lowerIsBetter: true,
            format: fmtMoney,
          }),
          tone: comparisonTone(calc.cpl, calc.mCpl, { lowerIsBetter: true }),
        },
        {
          id: 'leads',
          label: 'Leads previstos',
          value: calc.lp > 0 ? displayInt(calc.lp) : '0',
          sub: goalComparison(calc.lp, calc.mVol),
          tone: comparisonTone(calc.lp, calc.mVol),
        },
      ];
    }

    const prediction = predictionCard(agg.tF, agg.tCp, agg.tLuc);
    const gap = agg.tLuc > 0 ? Math.max(agg.tLuc - agg.tF, 0) : 0;

    return [
      {
        id: 'closed',
        label: 'Contratos fechados',
        value: displayInt(agg.tF),
        sub: `Semana ${week}`,
        tone: 'neutral',
      },
      {
        id: 'profitGoal',
        label: 'Meta de lucro',
        value: agg.tLuc > 0 ? displayInt(agg.tLuc) : '—',
        sub: agg.tLuc > 0 ? `${displayInt(gap)} para bater` : 'Sem meta configurada',
        tone: agg.tLuc > 0 ? 'neutral' : 'muted',
      },
      {
        id: 'predictedContracts',
        label: 'Contratos previstos',
        value: agg.tCp > 0 ? displayInt(agg.tCp) : '0',
        sub: prediction.sub,
        tone: prediction.tone,
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
        tone: comparisonTone(agg.cpl, agg.avgMC, { lowerIsBetter: true }),
      },
      {
        id: 'leads',
        label: 'Leads previstos',
        value: agg.tLp > 0 ? displayInt(agg.tLp) : '0',
        sub: goalComparison(agg.tLp, agg.tMV),
        tone: comparisonTone(agg.tLp, agg.tMV),
      },
    ];
  }, [agg, selectedRow, week]);

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
          onClick={() => admin && activeGdvRecord?.id && gdvLogoInputRef.current?.click()}
          disabled={!admin || !activeGdvRecord?.id || uploadingLogo}
          aria-label={admin && activeGdvRecord?.id ? 'Enviar imagem do GDV' : undefined}
          title={admin && activeGdvRecord?.id ? 'Clique para trocar a imagem' : gdvHeaderName}
        >
          {logoUrl ? <img src={logoUrl} alt="" /> : <span>{gdvInitials(activeGdvName || gdvHeaderName)}</span>}
          {admin && activeGdvRecord?.id ? (
            <em>{uploadingLogo ? <LoadingIcon size="xs" label="Atualizando avatar" /> : 'Trocar'}</em>
          ) : null}
        </button>

        <div className={styles.headerTitleText}>
          <strong>{gdvHeaderName}</strong>
          <small>{gdvHeaderSubtitle}</small>
        </div>
      </div>
    );

    const actions = (
      <div className={styles.headerActions}>
        <div className={styles.headerCluster}>
          <span className={styles.headerStat} title={`${displayInt(gdvClients.length)} clientes`}>
            <UsersIcon size={15} aria-hidden="true" />
            <strong>{displayInt(gdvClients.length)}</strong>
            <small>{gdvClients.length === 1 ? 'cliente' : 'clientes'}</small>
          </span>

          <div className={styles.monthNav}>
            <button type="button" className={styles.navBtn} onClick={prevMonth} aria-label="Mês anterior">
              ‹
            </button>
            <div className={styles.monthLabel}>
              {MONTHS[month0]} {year}
            </div>
            <button type="button" className={styles.navBtn} onClick={nextMonth} aria-label="Próximo mês">
              ›
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
          {admin && gdvOptions.length > 0 ? (
            <div className={styles.gdvMenu} ref={gdvMenuRef}>
              <button
                type="button"
                className={`${styles.gdvSelectButton} ${gdvMenuOpen ? styles.gdvSelectButtonOpen : ''}`.trim()}
                aria-haspopup="listbox"
                aria-expanded={gdvMenuOpen}
                onClick={() => setGdvMenuOpen((open) => !open)}
              >
                <span>{selectedGdv || 'Todos os GDVs'}</span>
                <span aria-hidden="true">⌄</span>
              </button>

              {gdvMenuOpen ? (
                <div className={styles.gdvOptions} role="listbox" aria-label="Filtrar carteira por GDV">
                  <button
                    type="button"
                    role="option"
                    aria-selected={!selectedGdv}
                    className={`${styles.gdvOption} ${!selectedGdv ? styles.gdvOptionActive : ''}`.trim()}
                    onClick={() => {
                      setSelectedGdv('');
                      setSelectedClientId(null);
                      setSearchParams((params) => {
                        const next = new URLSearchParams(params);
                        next.delete('gdv');
                        return next;
                      });
                      setGdvMenuOpen(false);
                    }}
                  >
                    Todos os GDVs
                  </button>

                  {gdvOptions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      role="option"
                      aria-selected={selectedGdv === name}
                      className={`${styles.gdvOption} ${selectedGdv === name ? styles.gdvOptionActive : ''}`.trim()}
                      onClick={() => {
                        setSelectedGdv(name);
                        setSelectedClientId(null);
                        setSearchParams((params) => {
                          const next = new URLSearchParams(params);
                          next.set('gdv', name);
                          return next;
                        });
                        setGdvMenuOpen(false);
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {superAdmin && activeGdvName ? (
            <UserPicker
              className={styles.ownerControl}
              users={Array.isArray(userDirectory) ? userDirectory : []}
              value={gdvOwnership.ownerId}
              placeholder="Sem proprietário"
              showRole
              onChange={async (userId) => {
                if (!activeGdvRecord?.id) return;

                await updateGdv(activeGdvRecord.id, {
                  name: activeGdvRecord.name,
                  ownerUserId: userId,
                });

                await refreshGdvs?.();
              }}
            />
          ) : null}
        </div>

        <div className={styles.headerCluster}>
          {admin && activeGdvRecord?.id && logoUrl ? (
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Remover imagem do GDV"
              title="Remover imagem do GDV"
              onClick={handleRemoveLogo}
            >
              <CloseIcon size={14} aria-hidden="true" />
            </button>
          ) : null}

          <button
            type="button"
            className={styles.iconButton}
            aria-label="Atualizar visão"
            title="Atualizar visão"
            onClick={() => {
              refreshGdvs?.();
              setMetricsByKey((prev) => {
                const next = { ...prev };
                delete next[periodKey];
                return next;
              });
            }}
          >
            <RotateCcwIcon size={14} aria-hidden="true" />
          </button>

          {fetchingKey === periodKey ? (
            <span className={styles.headerLoading}>
              <LoadingIcon size="sm" label="Carregando métricas" />
            </span>
          ) : null}
        </div>
      </div>
    );

    setPanelHeader({ title, actions });
  }, [
    activeGdvName,
    activeGdvRecord,
    admin,
    fetchingKey,
    gdvClients.length,
    gdvHeaderName,
    gdvHeaderSubtitle,
    gdvMenuOpen,
    gdvOptions,
    gdvOwnership.ownerId,
    handleRemoveLogo,
    logoUrl,
    month0,
    nextMonth,
    periodKey,
    prevMonth,
    refreshGdvs,
    selectedGdv,
    setPanelHeader,
    setSearchParams,
    superAdmin,
    uploadingLogo,
    userDirectory,
    week,
    year,
  ]);

  if (shellLoading && (!clients || clients.length === 0)) {
    return (
      <div className={styles.page}>
        <StateBlock variant="loading" title="Carregando carteira GDV" />
      </div>
    );
  }

  if (!gdvClients.length) {
    return (
      <div className={styles.page}>
        <StateBlock variant="empty" title="Carteira vazia" />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <input
        ref={gdvLogoInputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        onChange={handlePickLogo}
      />

      {selectedRow && renderStickyResult ? (
        <section className={`${styles.stickyResultBar} ${showStickyResult ? styles.stickyVisible : styles.stickyLeaving}`.trim()}>
          <span className={styles.clientAvatarMini}>{clientInitials(selectedRow.client.name)}</span>
          <strong>{selectedRow.client.name}</strong>

          <div className={styles.stickyMetric}>
            <span>Fechados</span>
            <b>{displayInt(selectedRow.calc.fec)}</b>
          </div>

          <div className={styles.stickyMetric}>
            <span>Meta</span>
            <b>{selectedRow.calc.mLuc > 0 ? displayInt(selectedRow.calc.mLuc) : '—'}</b>
          </div>

          <div className={styles.stickyMetric}>
            <span>Gap</span>
            <b>{selectedRow.calc.mLuc > 0 ? displayInt(selectedRow.weeklyGap) : '—'}</b>
          </div>

          <span className={`${styles.badge} ${toneClass(selectedRow.tone)}`.trim()}>
            {selectedRow.statusText}
          </span>

          <button type="button" className={styles.clearSelectionMini} onClick={() => setSelectedClientId(null)}>
            Limpar
          </button>
        </section>
      ) : null}

      <section ref={cardsRef} className={`${styles.metricGrid} ${fetchingKey === periodKey ? styles.metricGridLoading : ""}`.trim()}>
        {topCards.map((item) => (
          <article key={item.id} className={styles.metricCard}>
            <span className={styles.metricLabel}>{item.label}</span>
            <strong className={`${styles.metricValue} ${toneClass(item.tone)}`.trim()}>
              {item.value}
            </strong>
            <span className={`${styles.metricSub} ${toneClass(item.tone)}`.trim()}>
              {item.sub}
            </span>
          </article>
        ))}
      </section>

      <section className={styles.listToolbar}>
        <div className={styles.listTitle}>
          <span className={styles.cardEyebrow}>Clientes da carteira</span>
          <span className={styles.listMeta}>{displayInt(visibleRows.length)} cliente(s)</span>
          {loadingMetricsPartial ? (
            <span className={styles.listMeta}>{displayInt(currentResults.length)}/{displayInt(gdvClients.length)} métricas</span>
          ) : null}
        </div>

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

        {selectedRow ? (
          <button type="button" className={styles.clearSelection} onClick={() => setSelectedClientId(null)}>
            Limpar seleção
          </button>
        ) : null}
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
                  (squads || []).find((squad) => squad.id === client.squadId)?.name ||
                  client.squadName ||
                  'Sem squad';

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
                        <span>
                          {squadName}
                          {client.gestor ? ` · ${client.gestor}` : ''}
                        </span>
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
                      <span className={`${styles.badge} ${toneClass(row.tone)}`.trim()}>
                        {row.statusText}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className={styles.pagination}>
              <div className={styles.paginationInfo}>
                Mostrando {pageStart}-{pageEnd} de {visibleRows.length}
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
