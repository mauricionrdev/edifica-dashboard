import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { updateSquad } from '../api/squads.js';
import { getMetric } from '../api/metrics.js';
import { ApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  CloseIcon,
  RotateCcwIcon,
  SearchIcon,
  Select,
  StateBlock,
  TrophyIcon,
  UsersIcon,
} from '../components/ui/index.js';
import { canAccessSquad } from '../utils/permissions.js';
import { isAdminUser } from '../utils/roles.js';
import { resolveClientFeeAtMonthEnd } from '../utils/feeSchedule.js';
import { MONTHS, fmtInt, fmtMoney, fmtPct } from '../utils/format.js';
import { resolveSquadOwner, subscribeOwnershipChange } from '../utils/ownershipStorage.js';
import {
  aggregateCarteira,
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
import styles from './SquadPage.module.css';

function squadInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
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

function statusTone(progress, hasGoal, status) {
  if (status === 'churn') return 'red';
  if (!hasGoal) return 'muted';
  if (progress >= 100) return 'green';
  if (progress >= 55) return 'amber';
  return 'red';
}

function statusLabel(progress, hasGoal, status) {
  if (status === 'churn') return 'Churn';
  if (!hasGoal) return 'Sem meta';
  if (progress >= 100) return 'Meta batida';
  if (progress >= 55) return 'Em andamento';
  return 'Crítico';
}

function toneClass(stylesMap, tone) {
  return tone && stylesMap[tone] ? stylesMap[tone] : '';
}

function predictionCard(hit, total) {
  if (!total) {
    return {
      value: '0/0',
      sub: 'Sem meta',
      tone: 'muted',
    };
  }

  const willHit = hit >= total;
  return {
    value: `${displayInt(hit)}/${displayInt(total)}`,
    sub: willHit ? 'Vai bater a meta' : 'Não vai bater meta',
    tone: willHit ? 'green' : 'red',
  };
}

function goalComparison(current, goal, { lowerIsBetter = false, format = displayInt } = {}) {
  const currentValue = Number(current) || 0;
  const goalValue = Number(goal) || 0;

  if (goalValue <= 0) return '';

  const isGood = lowerIsBetter
    ? currentValue > 0 && currentValue <= goalValue
    : currentValue >= goalValue;

  const status = lowerIsBetter
    ? isGood
      ? 'Abaixo da meta'
      : 'Acima da meta'
    : isGood
      ? 'Acima da meta'
      : 'Abaixo da meta';

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

export default function SquadPage() {
  const { squadId } = useParams();
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

  const isAdmin = isAdminUser(user);
  const hasSquadAccess = useMemo(() => canAccessSquad(user, squadId), [user, squadId]);

  const squad = useMemo(
    () => (Array.isArray(squads) ? squads.find((item) => item.id === squadId) : null),
    [squads, squadId]
  );

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [week, setWeek] = useState(() => currentWeek(now));
  const [query, setQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [logoUrl, setLogoUrl] = useState(() => getSquadAvatar(squad));
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [ownershipTick, setOwnershipTick] = useState(0);
  const [metricsByKey, setMetricsByKey] = useState({});
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(null);
  const metricsFetchRef = useRef(0);
  const logoInputRef = useRef(null);

  const periodKey = useMemo(() => buildPeriodKey(year, month0, week), [year, month0, week]);

  const squadClients = useMemo(
    () =>
      filterOperationalClientsForPeriod(clients, year, month0).filter(
        (client) => client?.squadId === squadId
      ),
    [clients, month0, squadId, year]
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
          .then((response) => ({
            clientId: client.id,
            metric: response?.metric || null,
            err: null,
          }))
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

  const handleRemoveLogo = useCallback(async () => {
    if (!squad) return;
    try {
      await updateSquad(squad.id, {
        name: squad.name,
        ownerUserId: squad.ownerUserId || squad.owner?.id || '',
        logoUrl: '',
      });
      await refreshSquads?.();
      removeSquadAvatar(squad);
      setLogoUrl('');
      showToast('Logotipo do squad removido.', { variant: 'success' });
    } catch (err) {
      showToast(err?.message || 'Não foi possível remover o logotipo.', { variant: 'error' });
    }
  }, [refreshSquads, showToast, squad]);

  const handleOwnerChange = useCallback(
    async (event) => {
      if (!squad) return;
      try {
        await updateSquad(squad.id, {
          name: squad.name,
          ownerUserId: event.target.value,
          logoUrl: logoUrl || squad.logoUrl || '',
        });
        await refreshSquads?.();
        setOwnershipTick((current) => current + 1);
        showToast('Responsável do squad atualizado.', { variant: 'success' });
      } catch (err) {
        showToast(err?.message || 'Não foi possível atualizar o responsável.', {
          variant: 'error',
        });
      }
    },
    [logoUrl, refreshSquads, showToast, squad]
  );

  const metricRows = metricsByKey[periodKey] || [];

  const clientRows = useMemo(() => {
    return squadClients.map((client) => {
      const metricEntry = metricRows.find((row) => row.clientId === client.id);
      const metric = metricEntry?.metric || { data: {}, computed: {} };
      const calc = calcWeek(metric);

      const weeklyProgress = calc.mLuc > 0 ? (calc.fec / calc.mLuc) * 100 : 0;
      const weeklyGap = calc.mLuc > 0 ? Math.max(calc.mLuc - calc.fec, 0) : 0;
      const weeklyHasGoal = calc.mLuc > 0;
      const tone = statusTone(weeklyProgress, weeklyHasGoal, client.status);

      return {
        ...client,
        metric,
        calc,
        weeklyProgress,
        weeklyGap,
        weeklyHasGoal,
        tone,
        priorityScore:
          client.status === 'churn'
            ? 1000
            : weeklyHasGoal
              ? weeklyGap * 10 + Math.max(0, 100 - weeklyProgress)
              : 800,
        statusText: statusLabel(weeklyProgress, weeklyHasGoal, client.status),
      };
    });
  }, [metricRows, squadClients]);

  const agg = useMemo(
    () => aggregateCarteira(clientRows.map((row) => ({ client: row, metric: row.metric, calc: row.calc }))),
    [clientRows]
  );

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

  const filteredRows = useMemo(() => {
    const normalized = query.trim();
    const base = [...clientRows].sort((a, b) => b.priorityScore - a.priorityScore);
    if (!normalized) return base;
    return base.filter((row) => matchesAnySearch([row.name, row.gestor, row.gdvName], normalized));
  }, [clientRows, query]);

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
          onClick={() => isAdmin && logoInputRef.current?.click()}
          disabled={!isAdmin || uploadingLogo}
          aria-label={isAdmin ? 'Enviar logotipo do squad' : undefined}
          title={isAdmin ? 'Clique para trocar o logotipo' : squad.name}
        >
          {logoUrl ? <img src={logoUrl} alt="" /> : <span>{squadInitials(squad.name)}</span>}
          {isAdmin ? <em>{uploadingLogo ? '...' : 'Trocar'}</em> : null}
        </button>
        <div className={styles.headerTitleText}>
          <strong>{squad.name}</strong>
          <small>
            {squadOwnership.owner ? `Responsável: ${squadOwnership.owner.name}` : 'Sem responsável definido'} ·{' '}
            {squadOwnership.active ? 'Ativo' : 'Desativado'}
          </small>
        </div>
      </div>
    );

    const actions = (
      <div className={styles.headerActions}>
        <span className={styles.headerStat}>
          <UsersIcon size={14} aria-hidden="true" />
          <strong>{displayInt(squadClients.length)}</strong>
          <small>{squadClients.length === 1 ? 'cliente' : 'clientes'}</small>
        </span>

        {isAdmin ? (
          <Select
            className={styles.ownerControl}
            value={squad.ownerUserId || squad.owner?.id || ''}
            onChange={handleOwnerChange}
            aria-label="Responsável do squad"
          >
            <option value="">Sem responsável</option>
            {(Array.isArray(userDirectory) ? userDirectory : [])
              .filter((entry) => entry?.active !== false)
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
          </Select>
        ) : null}

        {isAdmin && logoUrl ? (
          <button
            type="button"
            className={`${styles.headerGhostBtn} ${styles.iconButton}`.trim()}
            onClick={handleRemoveLogo}
            aria-label="Remover logo"
            title="Remover logo"
          >
            <CloseIcon size={14} aria-hidden="true" />
          </button>
        ) : null}

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
              S{value}
            </button>
          ))}
        </div>

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

        {metricsLoading ? <span className={styles.inlineSpinner} aria-label="Carregando métricas" /> : null}
      </div>
    );

    setPanelHeader({ title, actions });
  }, [
    handleOwnerChange,
    handleRemoveLogo,
    isAdmin,
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
    squadOwnership.owner,
    uploadingLogo,
    userDirectory,
    week,
    year,
  ]);

  const topCards = useMemo(() => {
    if (selectedClient) {
      const prediction = predictionCard(
        selectedClient.calc.cp,
        selectedClient.calc.mLuc > 0 ? selectedClient.calc.mLuc : 0
      );

      return [
        {
          id: 'selected',
          label: 'Cliente selecionado',
          value: selectedClient.name,
          sub: selectedClient.gdvName || selectedClient.gestor || '',
          tone: 'neutral',
          wide: true,
        },
        {
          id: 'closed',
          label: 'Contratos fechados',
          value: displayInt(selectedClient.calc.fec),
          sub: `Semana ${week}`,
          tone: 'neutral',
        },
        {
          id: 'conversion',
          label: 'Taxa de conversão',
          value: selectedClient.calc.taxa > 0 ? displayPct(selectedClient.calc.taxa) : '—',
          sub: '',
          tone: selectedClient.calc.taxa > 0 ? 'neutral' : 'muted',
        },
        {
          id: 'predictedContracts',
          label: 'Contratos previstos',
          value: selectedClient.calc.cp > 0 ? displayInt(selectedClient.calc.cp) : '0',
          sub: prediction.sub,
          tone: prediction.tone,
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

    const prediction = predictionCard(agg.hit, agg.total);

    return [
      {
        id: 'closed',
        label: 'Contratos fechados',
        value: displayInt(agg.tF),
        sub: `Semana ${week}`,
        tone: 'neutral',
      },
      {
        id: 'conversion',
        label: 'Taxa de conversão',
        value: agg.taxa > 0 ? displayPct(agg.taxa) : '—',
        sub: '',
        tone: agg.taxa > 0 ? 'neutral' : 'muted',
      },
      {
        id: 'predictedContracts',
        label: 'Contratos previstos',
        value: agg.tCp > 0 ? displayInt(agg.tCp) : '0',
        sub: prediction.sub,
        tone: prediction.tone,
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
  }, [agg, selectedClient, week]);

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
          action={<Link to="/" className={styles.inlineAction}>Voltar para a Central</Link>}
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

      <section className={styles.metricGrid}>
        {topCards.map((card) => (
          <article
            key={card.id}
            className={`${styles.metricCard} ${card.wide ? styles.metricCardWide : ''}`.trim()}
          >
            <span className={styles.metricLabel}>{card.label}</span>
            <strong className={`${styles.metricValue} ${toneClass(styles, card.tone)}`.trim()}>
              {card.value}
            </strong>
            <span className={styles.metricSub}>{card.sub}</span>
          </article>
        ))}
      </section>

      <section className={styles.listCard}>
        <div className={styles.listToolbar}>
          <div className={styles.listTitle}>
            <span className={styles.cardEyebrow}>Clientes do squad</span>
            <span className={styles.listMeta}>{displayInt(filteredRows.length)} cliente(s)</span>
          </div>

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

          {selectedClient ? (
            <button type="button" className={styles.clearSelection} onClick={() => setSelectedClientId(null)}>
              Limpar seleção
            </button>
          ) : null}
        </div>

        {metricsError ? (
          <StateBlock variant="warning" compact title="Métricas indisponíveis" />
        ) : filteredRows.length === 0 ? (
          <StateBlock variant="empty" compact title="Nenhum cliente encontrado" />
        ) : (
          <div className={styles.clientList}>
            {filteredRows.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`${styles.clientRow} ${selectedClientId === row.id ? styles.clientRowActive : ''}`.trim()}
                onClick={() => setSelectedClientId(row.id)}
              >
                <div className={styles.clientMain}>
                  <strong>{row.name}</strong>
                  <span>
                    {row.gestor || 'Sem gestor'}
                    {row.gdvName ? ` · ${row.gdvName}` : ''}
                  </span>
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
        )}
      </section>
    </div>
  );
}
