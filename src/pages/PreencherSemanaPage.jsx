import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { clearMetricPresence, getMetric, listMetricPresence, touchMetricPresence, upsertMetric } from '../api/metrics.js';
import { ApiError } from '../api/client.js';
import { SearchIcon, Select, UsersIcon } from '../components/ui/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { canFillMetrics } from '../utils/permissions.js';
import { MONTHS_FULL, fmtInt, fmtPct } from '../utils/format.js';
import { buildPeriodKey, calcWeek, currentWeek } from '../utils/gdvMetrics.js';
import { parseLocaleNumber } from '../utils/number.js';
import { matchesAnySearch } from '../utils/search.js';
import styles from './PreencherSemanaPage.module.css';

const INLINE_FIELDS = [
  { key: 'investimento', label: 'Investimento', step: '0.01', placeholder: '0' },
  { key: 'cpl', label: 'CPL atual', step: '0.01', placeholder: '0.00' },
  { key: 'metaCpl', label: 'Meta CPL', step: '0.01', placeholder: 'meta' },
  { key: 'volume', label: 'Volume', placeholder: '0' },
  { key: 'metaVolume', label: 'Meta volume', placeholder: 'meta' },
  { key: 'fechados', label: 'Fechados', placeholder: '0' },
  { key: 'metaEmpate', label: 'Meta emp.', placeholder: 'emp.' },
  { key: 'metaSemanal', label: 'Meta lucro', placeholder: 'luc.' },
];

const EMPTY_DATA = {
  metaSemanal: '',
  fechados: '',
  investimento: '',
  cpl: '',
  volume: '',
  metaEmpate: '',
  metaVolume: '',
  metaCpl: '',
  observacoes: '',
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

function dataFromMetric(metric) {
  const data = metric?.data || {};
  return {
    metaSemanal: data.metaSemanal == null ? '' : String(data.metaSemanal),
    fechados: data.fechados == null ? '' : String(data.fechados),
    investimento: data.investimento == null ? '' : String(data.investimento),
    cpl: data.cpl == null ? '' : String(data.cpl),
    volume: data.volume == null ? '' : String(data.volume),
    metaEmpate: data.metaEmpate == null ? '' : String(data.metaEmpate),
    metaVolume: data.metaVolume == null ? '' : String(data.metaVolume),
    metaCpl: data.metaCpl == null ? '' : String(data.metaCpl),
    observacoes: data.observacoes || '',
  };
}

function sanitizeForSave(form) {
  const payload = {};
  Object.entries(form).forEach(([key, raw]) => {
    if (key === 'observacoes') {
      if (String(raw || '').trim()) payload.observacoes = String(raw).trim();
      return;
    }
    if (raw === '' || raw == null) return;
    const numeric = parseLocaleNumber(raw);
    if (!Number.isNaN(numeric) && numeric >= 0) payload[key] = numeric;
  });
  return payload;
}

function filteredClientsForSelect(clients, squadFilter) {
  const list = Array.isArray(clients) ? clients.filter((client) => client && client.status !== 'churn') : [];
  const filtered = squadFilter
    ? list.filter((client) => (client.squadId || client.squad_id) === squadFilter)
    : list;

  return [...filtered].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
}

function StatusChip({ status }) {
  if (status === 'saving') {
    return <span className={`${styles.statusChip} ${styles.statusSaving}`}>Salvando...</span>;
  }
  if (status === 'saved') {
    return <span className={`${styles.statusChip} ${styles.statusSaved}`}>Salvo</span>;
  }
  if (status === 'error') {
    return <span className={`${styles.statusChip} ${styles.statusError}`}>Erro</span>;
  }
  return null;
}

function normalizePresenceRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((entry) => ({
      clientId: entry?.clientId || '',
      fieldKey: entry?.fieldKey || '',
      userId: entry?.userId || '',
      userName: entry?.userName || '',
    }))
    .sort((a, b) =>
      `${a.clientId}:${a.fieldKey}:${a.userId}:${a.userName}`.localeCompare(
        `${b.clientId}:${b.fieldKey}:${b.userId}:${b.userName}`,
        'pt-BR'
      )
    );
}

function arePresenceMapsEqual(a = {}, b = {}) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    const aItems = Array.isArray(a[key]) ? a[key] : [];
    const bItems = Array.isArray(b[key]) ? b[key] : [];
    if (aItems.length !== bItems.length) return false;
    for (let index = 0; index < aItems.length; index += 1) {
      if (
        aItems[index]?.userId !== bItems[index]?.userId ||
        aItems[index]?.userName !== bItems[index]?.userName
      ) {
        return false;
      }
    }
  }

  return true;
}

function WeekRowBase({ client, periodKey, week, canEdit, onSaved, presenceByField }) {
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('idle');
  const [serverComputed, setServerComputed] = useState({});
  const loadGenRef = useRef(0);
  const saveTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const latestFormRef = useRef(EMPTY_DATA);
  const lastSavedRef = useRef('{}');
  const activeFieldRef = useRef('');
  const presenceTimerRef = useRef(null);

  const runSave = useCallback(
    async (nextForm, immediate = false) => {
      const payload = sanitizeForSave(nextForm);
      const serialized = JSON.stringify(payload);
      if (serialized === lastSavedRef.current) {
        if (mountedRef.current && !immediate) setStatus('idle');
        return;
      }

      if (mountedRef.current) setStatus('saving');
      try {
        const res = await upsertMetric(client.id, periodKey, payload);
        lastSavedRef.current = serialized;
        if (!mountedRef.current) return;
        setServerComputed(res?.metric?.computed || {});
        setStatus('saved');
        onSaved?.(client.id, res);
        setTimeout(() => {
          if (mountedRef.current) {
            setStatus((current) => (current === 'saved' ? 'idle' : current));
          }
        }, 1200);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 401) && mountedRef.current) {
          showToast(`Erro ao salvar ${client.name}`, 'error');
        }
        if (mountedRef.current) setStatus('error');
      }
    },
    [client.id, client.name, onSaved, periodKey, showToast]
  );

  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    return runSave(latestFormRef.current, true);
  }, [runSave]);

  const stopPresence = useCallback(async (fieldKey = activeFieldRef.current) => {
    if (presenceTimerRef.current) {
      clearInterval(presenceTimerRef.current);
      presenceTimerRef.current = null;
    }
    const activeField = String(fieldKey || '').trim();
    activeFieldRef.current = '';
    if (!activeField) return;
    try {
      await clearMetricPresence(client.id, periodKey, activeField);
    } catch {
      // presença é apenas visual; falha silenciosa
    }
  }, [client.id, periodKey]);

  const startPresence = useCallback(async (fieldKey) => {
    const nextField = String(fieldKey || '').trim();
    if (!nextField) return;
    if (activeFieldRef.current && activeFieldRef.current !== nextField) {
      await stopPresence(activeFieldRef.current);
    }
    activeFieldRef.current = nextField;
    try {
      await touchMetricPresence(client.id, periodKey, nextField);
    } catch {
      // presença é apenas visual; falha silenciosa
    }
    if (presenceTimerRef.current) clearInterval(presenceTimerRef.current);
    presenceTimerRef.current = setInterval(() => {
      void touchMetricPresence(client.id, periodKey, nextField).catch(() => {});
    }, 7000);
  }, [client.id, periodKey, stopPresence]);

  useEffect(() => {
    mountedRef.current = true;
    const token = ++loadGenRef.current;
    setLoaded(false);

    getMetric(client.id, periodKey)
      .then((res) => {
        if (loadGenRef.current !== token) return;
        const nextForm = dataFromMetric(res?.metric);
        latestFormRef.current = nextForm;
        lastSavedRef.current = JSON.stringify(sanitizeForSave(nextForm));
        setForm(nextForm);
        setServerComputed(res?.metric?.computed || {});
        setLoaded(true);
      })
      .catch((err) => {
        if (loadGenRef.current !== token) return;
        if (!(err instanceof ApiError && err.status === 401)) {
          showToast(`Erro ao carregar ${client.name}`, 'error');
        }
        latestFormRef.current = EMPTY_DATA;
        lastSavedRef.current = JSON.stringify(sanitizeForSave(EMPTY_DATA));
        setLoaded(true);
      });

    return () => {
      mountedRef.current = false;
      if (presenceTimerRef.current) {
        clearInterval(presenceTimerRef.current);
        presenceTimerRef.current = null;
      }
      if (activeFieldRef.current) {
        void clearMetricPresence(client.id, periodKey, activeFieldRef.current).catch(() => {});
        activeFieldRef.current = '';
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        void runSave(latestFormRef.current, true);
      }
    };
  }, [client.id, client.name, periodKey, runSave, showToast]);

  const localCalc = useMemo(
    () => calcWeek({ data: sanitizeForSave(form), computed: serverComputed }),
    [form, serverComputed]
  );

  const scheduleSave = useCallback(
    (nextForm) => {
      latestFormRef.current = nextForm;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void runSave(nextForm);
      }, 500);
    },
    [runSave]
  );

  function setField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      scheduleSave(next);
      return next;
    });
  }

  const goal = localCalc.mLuc > 0 ? localCalc.mLuc : parseLocaleNumber(form.metaSemanal, 0);
  const fechados = parseLocaleNumber(form.fechados, 0);
  const pct = goal > 0 ? Math.min((fechados / goal) * 100, 999) : 0;
  const tone = !loaded ? 'neutral' : goal === 0 ? 'neutral' : pct >= 100 ? 'good' : pct >= 50 ? 'warning' : 'risk';
  const statusLabel = !loaded ? '...' : goal === 0 ? 'Sem meta' : pct >= 100 ? 'Meta batida' : pct >= 50 ? 'Em andamento' : 'Em risco';

  return (
    <article className={styles.inlineRow}>
      <div className={styles.clientCell}>
        <button type="button" className={styles.clientBadge} aria-label={`${client.name} semana ${week}`}>
          {String(client.name || '?').trim().charAt(0).toUpperCase()}
        </button>
        <div className={styles.clientMeta}>
          <strong>{client.name}</strong>
          <small>{client.squadName || '—'}</small>
        </div>
      </div>

      {INLINE_FIELDS.map((field) => (
        <div key={field.key} className={styles.metricCell}>
          {Array.isArray(presenceByField?.[field.key]) && presenceByField[field.key].length > 0 ? (
            <span
              className={styles.presenceHint}
              title={`${presenceByField[field.key].map((entry) => entry.userName).join(', ')} editando`}
              aria-label={`${presenceByField[field.key].map((entry) => entry.userName).join(', ')} editando`}
            >
              💬
            </span>
          ) : null}
          <input
            type="text"
            inputMode="decimal"
            value={form[field.key]}
            onChange={(event) => setField(field.key, event.target.value)}
            onFocus={() => {
              if (canEdit) void startPresence(field.key);
            }}
            onBlur={() => {
              void flushPendingSave();
              void stopPresence(field.key);
            }}
            className={styles.metricInput}
            placeholder={field.placeholder}
            disabled={!canEdit}
            aria-label={`${field.label} de ${client.name}`}
          />
        </div>
      ))}

      <div className={styles.computedCell}>
        <span className={styles.computedValue}>{localCalc.lp > 0 ? fmtInt(Math.round(localCalc.lp)) : '—'}</span>
      </div>
      <div className={styles.computedCell}>
        <span className={styles.computedValue}>{localCalc.taxa > 0 ? fmtPct(localCalc.taxa) : '—'}</span>
      </div>
      <div className={styles.computedCell}>
        <span className={styles.computedValue}>{localCalc.cp > 0 ? fmtInt(Math.round(localCalc.cp)) : '—'}</span>
      </div>

      <div className={styles.statusCell}>
        <span className={`${styles.statusPill} ${styles[`statusPill_${tone}`]}`}>{statusLabel}</span>
        <StatusChip status={status} />
      </div>
    </article>
  );
}

const WeekRow = memo(WeekRowBase, (prevProps, nextProps) => {
  return (
    prevProps.client === nextProps.client &&
    prevProps.periodKey === nextProps.periodKey &&
    prevProps.week === nextProps.week &&
    prevProps.canEdit === nextProps.canEdit &&
    prevProps.onSaved === nextProps.onSaved &&
    arePresenceMapsEqual(prevProps.presenceByField, nextProps.presenceByField)
  );
});

export default function PreencherSemanaPage() {
  const { clients, squads, loading: shellLoading, setPanelHeader } = useOutletContext();
  const { user } = useAuth();
  const canEditMetrics = canFillMetrics(user);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [week, setWeek] = useState(() => currentWeek(now));
  const [squadFilter, setSquadFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [presenceRows, setPresenceRows] = useState([]);
  const presenceSnapshotRef = useRef('[]');

  const periodKey = useMemo(() => buildPeriodKey(year, month0, week), [year, month0, week]);
  const activeClients = useMemo(
    () => (Array.isArray(clients) ? clients.filter((client) => client && client.status !== 'churn') : []),
    [clients]
  );

  const squadsAvailable = useMemo(() => {
    const isAdmin = user?.role === 'admin' || user?.isMaster;
    if (isAdmin) return squads;
    const allowed = Array.isArray(user?.squads) ? user.squads : [];
    return squads.filter((squad) => allowed.includes(squad.id));
  }, [squads, user]);

  const monthOptions = useMemo(() => {
    const options = [];
    for (let index = 0; index < 12; index += 1) {
      let optionYear = now.getFullYear();
      let optionMonth = now.getMonth() - index;
      while (optionMonth < 0) {
        optionMonth += 12;
        optionYear -= 1;
      }
      options.push({ y: optionYear, m: optionMonth, label: `${MONTHS_FULL[optionMonth]} ${optionYear}` });
    }
    return options;
  }, [now]);

  const filteredClients = useMemo(() => {
    let list = Array.isArray(clients) ? clients.filter((client) => client && client.status !== 'churn') : [];
    if (squadFilter) list = list.filter((client) => (client.squadId || client.squad_id) === squadFilter);
    if (clientFilter) list = list.filter((client) => client.id === clientFilter);

    if (query.trim()) {
      list = list.filter((client) =>
        matchesAnySearch([client.name, client.squadName, client.gdvName, client.gestor], query)
      );
    }

    return [...list].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
  }, [clientFilter, clients, query, squadFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / pageSize));
  const visibleClients = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return filteredClients.slice(start, start + pageSize);
  }, [filteredClients, page, pageSize, totalPages]);

  useEffect(() => {
    if (!visibleClients.length) {
      presenceSnapshotRef.current = '[]';
      setPresenceRows([]);
      return undefined;
    }

    let cancelled = false;
    const clientIds = visibleClients.map((client) => client.id);

    async function loadPresence() {
      try {
        const res = await listMetricPresence({ clientIds, periodKey });
        if (cancelled) return;
        const normalized = normalizePresenceRows(res?.presence);
        const snapshot = JSON.stringify(normalized);
        if (snapshot === presenceSnapshotRef.current) return;
        presenceSnapshotRef.current = snapshot;
        setPresenceRows(normalized);
      } catch {
        if (cancelled) return;
        if (presenceSnapshotRef.current === '[]') return;
        presenceSnapshotRef.current = '[]';
        setPresenceRows([]);
      }
    }

    void loadPresence();
    const timer = setInterval(() => {
      void loadPresence();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [periodKey, visibleClients]);

  const presenceByClientField = useMemo(() => {
    const map = {};
    presenceRows.forEach((entry) => {
      if (!entry?.clientId || !entry?.fieldKey || entry.userId === user?.id) return;
      if (!map[entry.clientId]) map[entry.clientId] = {};
      if (!map[entry.clientId][entry.fieldKey]) map[entry.clientId][entry.fieldKey] = [];
      map[entry.clientId][entry.fieldKey].push(entry);
    });
    return map;
  }, [presenceRows, user?.id]);

  useEffect(() => {
    setPage(1);
  }, [clientFilter, pageSize, query, squadFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const title = (
      <>
        <strong>Preencher Semana</strong>
        <span>·</span>
        <span>{`${MONTHS_FULL[month0]} ${year} · S${week}`}</span>
      </>
    );

    const actions = (
      <div className={styles.headerControls}>
        <span className={styles.headerStat} title={`${fmtInt(filteredClients.length)} clientes visíveis`}>
          <UsersIcon size={14} aria-hidden="true" />
          <strong>{fmtInt(filteredClients.length)}</strong>
          <small>{filteredClients.length === 1 ? 'cliente' : 'clientes'}</small>
        </span>

        {squadsAvailable.length > 0 ? (
          <Select
            className={styles.select}
            value={squadFilter}
            onChange={(event) => {
              setSquadFilter(event.target.value);
              setClientFilter('');
            }}
            aria-label="Filtrar por squad"
            placeholder="Todos squads"
          >
            <option value="">Todos squads</option>
            {squadsAvailable.map((squad) => (
              <option key={squad.id} value={squad.id}>
                {squad.name}
              </option>
            ))}
          </Select>
        ) : null}

        <Select
          className={styles.select}
          value={clientFilter}
          onChange={(event) => setClientFilter(event.target.value)}
          aria-label="Filtrar por cliente"
          placeholder="Todos clientes"
        >
          <option value="">Todos clientes</option>
          {filteredClientsForSelect(clients, squadFilter).map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </Select>

        <Select
          className={styles.select}
          value={`${year}-${month0}`}
          onChange={(event) => {
            const [nextYear, nextMonth] = event.target.value.split('-').map(Number);
            if (Number.isFinite(nextYear) && Number.isFinite(nextMonth)) {
              setYear(nextYear);
              setMonth0(nextMonth);
            }
          }}
          aria-label="Mês"
          placeholder="Selecionar mês"
        >
          {monthOptions.map((option) => (
            <option key={`${option.y}-${option.m}`} value={`${option.y}-${option.m}`}>
              {option.label}
            </option>
          ))}
        </Select>

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
      </div>
    );

    setPanelHeader({ title, actions });
  }, [
    clientFilter,
    clients,
    filteredClients.length,
    month0,
    monthOptions,
    setPanelHeader,
    squadFilter,
    squadsAvailable,
    week,
    year,
  ]);

  if (shellLoading && clients.length === 0) {
    return (
      <div className="content">
        <div className={styles.workspace}>
          <div className={styles.skeletonCard} />
        </div>
      </div>
    );
  }

  if (filteredClients.length === 0 && activeClients.length === 0 && !query.trim() && !squadFilter && !clientFilter) {
    return (
      <div className="content">
        <div className={styles.workspace}>
          <div className={styles.emptyState}>
            <h2>Nenhum cliente</h2>
            <p>
              {squadFilter || clientFilter
                ? 'Ajuste os filtros para ver outros clientes.'
                : 'Cadastre clientes ativos em Clientes para começar.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className={styles.workspace}>
        <section className={styles.tablePanel}>
          <div className={styles.tableHeader}>
            <div className={styles.tableTitleBlock}>
              <strong>Preenchimento operacional da semana</strong>
              <p>Carteira da semana com foco só no que precisa ser alimentado.</p>
            </div>
            <div className={styles.tableHeaderActions}>
              <span>{filteredClients.length} cliente(s)</span>
              <Select
                className={styles.pageSizeSelect}
                value={String(pageSize)}
                onChange={(event) => setPageSize(Number(event.target.value) || 20)}
                aria-label="Quantidade de clientes por página"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} por página
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <label className={styles.searchField}>
            <span>Buscar na lista</span>
            <div className={styles.searchControl}>
              <SearchIcon size={15} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cliente, squad, GDV ou gestor"
              />
            </div>
          </label>

          <div className={styles.inlineTable}>
            <div className={styles.inlineHeader}>
              <span className={styles.colClient}>Cliente</span>
              <span>Investimento</span>
              <span>CPL atual</span>
              <span>Meta CPL</span>
              <span>Volume</span>
              <span>Meta volume</span>
              <span>Fechados</span>
              <span>Meta emp.</span>
              <span>Meta lucro</span>
              <span>Leads prev.</span>
              <span>Taxa conv.</span>
              <span>Prev. contr.</span>
              <span>Status</span>
            </div>

            {filteredClients.length === 0 ? (
              <div className={styles.emptyTableState}>
                <h2>Nenhum resultado</h2>
              </div>
            ) : (
              visibleClients.map((client) => (
                <WeekRow
                  key={`${client.id}-${periodKey}`}
                  client={client}
                  periodKey={periodKey}
                  week={week}
                  canEdit={canEditMetrics}
                  onSaved={() => {}}
                  presenceByField={presenceByClientField[client.id] || {}}
                />
              ))
            )}
          </div>

          {filteredClients.length > pageSize ? (
            <div className={styles.pagination}>
              <span>
                Exibindo {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredClients.length)} de{' '}
                {filteredClients.length}
              </span>
              <div className={styles.pageButtons}>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`${styles.pageButton} ${page === value ? styles.pageButtonActive : ''}`.trim()}
                    onClick={() => setPage(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
