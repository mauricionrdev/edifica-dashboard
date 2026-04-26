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
  getPriority,
  sortByPriority,
} from '../utils/gdvMetrics.js';
import { MONTHS, MONTHS_FULL, fmtInt, fmtMoney, fmtPct } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { isAdminUser, isSuperAdmin, roleLabel } from '../utils/roles.js';
import StateBlock from '../components/ui/StateBlock.jsx';
import { CloseIcon, RotateCcwIcon, Select, UsersIcon } from '../components/ui/index.js';
import { filterOperationalClientsForPeriod } from '../utils/operationalClients.js';
import { matchesAnySearch } from '../utils/search.js';
import {
  getGdvAvatar,
  readAvatarFile,
  removeGdvAvatar,
  saveGdvAvatar,
  subscribeAvatarChange,
} from '../utils/avatarStorage.js';
import styles from './GdvPage.module.css';

function statusBreakdown(rows) {
  return rows.reduce(
    (acc, row) => {
      if (!row.calc.hasData) acc.empty += 1;
      else if (row.calc.isHit) acc.ok += 1;
      else if (row.priority.cls === 'pri-h') acc.high += 1;
      else acc.mid += 1;
      return acc;
    },
    { ok: 0, mid: 0, high: 0, empty: 0 }
  );
}

function displayInt(value) {
  const numeric = Number(value) || 0;
  return numeric === 0 ? '0' : fmtInt(numeric);
}

function displayPct(value) {
  const numeric = Number(value) || 0;
  if (numeric === 0) return '0%';
  return fmtPct(numeric);
}

function buildPredictionCard(hit, total) {
  if (!total) {
    return {
      value: '0/0',
      sub: '',
      tone: 'muted',
    };
  }

  const pct = (hit / total) * 100;
  return {
    value: `${displayInt(hit)}/${displayInt(total)}`,
    sub: displayPct(pct),
    tone: pct >= 70 ? 'green' : pct > 0 ? 'amber' : 'muted',
  };
}

function gdvInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'GD';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
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
  const gdvMenuRef = useRef(null);
  const gdvLogoInputRef = useRef(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [week, setWeek] = useState(() => currentWeek(now));
  const periodKey = useMemo(() => buildPeriodKey(year, month0, week), [year, month0, week]);

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
  }, [clients, admin, selectedGdv, user, year, month0]);

  const [metricsByKey, setMetricsByKey] = useState({});
  const [fetchingKey, setFetchingKey] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [clientQuery, setClientQuery] = useState('');
  const fetchGenRef = useRef(0);

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
    if (!gdvClients.length) {
      setMetricsByKey((prev) => ({ ...prev, [periodKey]: [] }));
      return;
    }

    const cached = metricsByKey[periodKey];
    if (Array.isArray(cached)) {
      const cachedIds = cached.map((entry) => entry.clientId).sort().join('|');
      if (cachedIds === gdvIdsKey) return;
    }

    const gen = ++fetchGenRef.current;
    setFetchingKey(periodKey);
    setFetchError(null);

    Promise.all(
      gdvClients.map((client) =>
        getMetric(client.id, periodKey)
          .then((response) => ({ clientId: client.id, metric: response?.metric || null, err: null }))
          .catch((err) => ({ clientId: client.id, metric: null, err }))
      )
    )
      .then((results) => {
        if (fetchGenRef.current !== gen) return;

        const anyAuthErr = results.find(
          (result) => result.err instanceof ApiError && result.err.status === 401
        );
        if (anyAuthErr) return;

        setMetricsByKey((prev) => ({ ...prev, [periodKey]: results }));

        const failures = results.filter(
          (result) => result.err && !(result.err instanceof ApiError && result.err.status === 404)
        );
        if (failures.length > 0 && failures.length === results.length) {
          setFetchError(new Error('Falha ao carregar métricas da carteira.'));
        }
      })
      .finally(() => {
        if (fetchGenRef.current === gen) setFetchingKey(null);
      });
  }, [gdvClients, gdvIdsKey, metricsByKey, periodKey]);

  const currentResults = metricsByKey[periodKey] || [];
  const loadingMetrics = fetchingKey === periodKey && currentResults.length === 0;

  const rows = useMemo(() => {
    return gdvClients.map((client) => {
      const entry = currentResults.find((result) => result.clientId === client.id);
      const metric = entry?.metric || { data: {}, computed: {} };
      const calc = calcWeek(metric);
      const priority = getPriority(calc);
      return { client, metric, calc, priority };
    });
  }, [currentResults, gdvClients]);

  useEffect(() => {
    if (!selectedClientId) return;
    const exists = rows.some((row) => row.client.id === selectedClientId);
    if (!exists) setSelectedClientId(null);
  }, [rows, selectedClientId]);

  const agg = useMemo(() => aggregateCarteira(rows), [rows]);
  const sortedRows = useMemo(() => sortByPriority(rows), [rows]);
  const breakdown = useMemo(() => statusBreakdown(sortedRows), [sortedRows]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.client.id === selectedClientId) || null,
    [rows, selectedClientId]
  );

  const visibleRows = useMemo(() => {
    const query = clientQuery.trim();
    if (!query) return sortedRows;

    return sortedRows.filter(({ client }) => {
      return matchesAnySearch([client.name, client.squadName, client.gestor], query);
    });
  }, [clientQuery, sortedRows]);

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
    return gdvOwnership.owner?.name || 'Sem proprietário';
  }, [activeGdvName, gdvOwnership.owner?.name]);

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
      const { client, calc } = selectedRow;
      const prediction = buildPredictionCard(calc.mLuc > 0 && calc.cp >= calc.mLuc ? 1 : 0, calc.mLuc > 0 ? 1 : 0);

      return [
        {
          label: 'Contratos fechados',
          value: displayInt(calc.fec),
          sub: `S${week}`,
          tone: 'neutral',
        },
        {
          label: 'Taxa de conversão',
          value: calc.taxa > 0 ? displayPct(calc.taxa) : '—',
          sub: '',
          tone: calc.taxa > 0 ? 'neutral' : 'muted',
        },
        {
          label: 'Meta de empate',
          value: calc.mEmp > 0 ? displayInt(calc.mEmp) : '—',
          sub: '',
          tone: calc.mEmp > 0 ? 'neutral' : 'muted',
        },
        {
          label: 'Meta de lucro',
          value: calc.mLuc > 0 ? displayInt(calc.mLuc) : '—',
          sub: '',
          tone: calc.mLuc > 0 ? 'neutral' : 'muted',
        },
        {
          label: 'Contratos previstos',
          value: calc.cp > 0 ? displayInt(calc.cp) : '0',
          sub: '',
          tone: calc.cp > 0 ? 'neutral' : 'muted',
        },
        {
          label: 'CPL atual',
          value: calc.cpl > 0 ? fmtMoney(calc.cpl) : '—',
          sub: calc.mCpl > 0 ? fmtMoney(calc.mCpl) : '',
          tone: calc.cpl > 0 ? 'neutral' : 'muted',
        },
        {
          label: 'Leads previstos',
          value: calc.lp > 0 ? displayInt(calc.lp) : '0',
          sub: calc.mVol > 0 ? displayInt(calc.mVol) : '',
          tone: calc.lp > 0 ? 'neutral' : 'muted',
        },
        {
          label: 'Cliente - previsão',
          value: prediction.value,
          sub: prediction.sub,
          tone: prediction.tone,
        },
      ];
    }

    const prediction = buildPredictionCard(agg.hit, agg.total);

    return [
      {
        label: 'Contratos fechados',
        value: displayInt(agg.tF),
          sub: `S${week}`,
        tone: 'neutral',
      },
      {
        label: 'Taxa de conversão',
        value: agg.taxa > 0 ? displayPct(agg.taxa) : '—',
          sub: '',
        tone: agg.taxa > 0 ? 'neutral' : 'muted',
      },
      {
        label: 'Meta de empate',
        value: agg.tEmp > 0 ? displayInt(agg.tEmp) : '—',
          sub: '',
        tone: agg.tEmp > 0 ? 'neutral' : 'muted',
      },
      {
        label: 'Meta de lucro',
        value: agg.tLuc > 0 ? displayInt(agg.tLuc) : '—',
          sub: '',
        tone: agg.tLuc > 0 ? 'neutral' : 'muted',
      },
      {
        label: 'Contratos previstos',
        value: agg.tCp > 0 ? displayInt(agg.tCp) : '0',
          sub: '',
        tone: agg.tCp > 0 ? 'neutral' : 'muted',
      },
      {
        label: 'CPL atual',
        value: agg.cpl > 0 ? fmtMoney(agg.cpl) : '—',
          sub: agg.avgMC > 0 ? fmtMoney(agg.avgMC) : '',
        tone: agg.cpl > 0 ? 'neutral' : 'muted',
      },
      {
        label: 'Leads previstos',
        value: agg.tLp > 0 ? displayInt(agg.tLp) : '0',
          sub: agg.tMV > 0 ? displayInt(agg.tMV) : '',
        tone: agg.tLp > 0 ? 'neutral' : 'muted',
      },
      {
        label: 'Carteira - previsão',
        value: prediction.value,
        sub: prediction.sub,
        tone: prediction.tone,
      },
    ];
  }, [agg, rows.length, selectedRow, week]);

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
          {admin && activeGdvRecord?.id ? <em>{uploadingLogo ? '...' : 'Trocar'}</em> : null}
        </button>
        <div className={styles.headerTitleText}>
          <strong>{gdvHeaderName}</strong>
          <small>
            {activeGdvName || 'Carteira GDV'} · {gdvOwnership.active ? 'Ativo' : 'Desativado'}
          </small>
        </div>
      </div>
    );

    const actions = (
      <div className={styles.headerActions}>
        <span className={styles.headerStat} title={`${displayInt(gdvClients.length)} clientes`}>
          <UsersIcon size={14} aria-hidden="true" />
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
          <Select
            className={styles.ownerControl}
            value={gdvOwnership.ownerId}
            onChange={async (event) => {
              if (!activeGdvRecord?.id) return;
              await updateGdv(activeGdvRecord.id, {
                name: activeGdvRecord.name,
                ownerUserId: event.target.value,
              });
              await refreshGdvs?.();
            }}
            placeholder="Proprietário GDV"
            aria-label="Selecionar proprietário do GDV"
          >
            <option value="">Sem proprietário</option>
            {(Array.isArray(userDirectory) ? userDirectory : [])
              .filter((entry) => entry?.active !== false)
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} · {roleLabel(entry.role)}
                </option>
              ))}
          </Select>
        ) : null}

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
          <span title="Carregando métricas" className={styles.inlineSpinner} aria-label="Carregando" />
        ) : null}
      </div>
    );

    setPanelHeader({ title, actions });
  }, [
    activeGdvName,
    activeGdvRecord?.id,
    admin,
    fetchingKey,
    gdvClients.length,
    gdvHeaderName,
    gdvMenuOpen,
    gdvOwnership.active,
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
        <StateBlock
          variant="loading"
          title="Carregando carteira GDV"
        />
      </div>
    );
  }

  if (!gdvClients.length) {
    return (
      <div className={styles.page}>
        <StateBlock
          variant="empty"
          title="Carteira vazia"
        />
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

      <section className={styles.executiveGrid}>
        {topCards.map((item) => (
          <div key={item.label} className={`${styles.card} ${styles.executiveCard}`}>
            <span className={styles.executiveLabel}>{item.label}</span>
            <strong className={`${styles.executiveValue} ${item.tone && styles[item.tone] ? styles[item.tone] : ''}`.trim()}>
              {item.value}
            </strong>
            <span className={styles.executiveSub}>{item.sub}</span>
          </div>
        ))}
        <div className={`${styles.card} ${styles.executiveCard}`}>
          <span className={styles.executiveLabel}>Semana</span>
          <strong className={`${styles.executiveValue} ${styles.amber}`}>S{week}</strong>
          <span className={styles.executiveSub}>{MONTHS_FULL[month0]} {year}</span>
        </div>
      </section>

      <section className={`${styles.card} ${styles.clientPanel}`}>
        <div className={styles.sectionHeader}>
          <div>
            <h3>Clientes da carteira</h3>
          </div>
          {selectedRow ? (
            <button type="button" className={styles.clearSelection} onClick={() => setSelectedClientId(null)}>
              Limpar seleção
            </button>
          ) : null}
        </div>

        <div className={styles.clientToolbar}>
          <label className={styles.clientSearch}>
            <span className={styles.clientSearchIcon} aria-hidden="true">
              ⌕
            </span>
            <input
              type="search"
              value={clientQuery}
              onChange={(event) => setClientQuery(event.target.value)}
              placeholder="Buscar cliente, squad ou gestor..."
            />
          </label>

          <div className={styles.clientToolbarMeta}>
            <span>{displayInt(visibleRows.length)} cliente(s)</span>
            {selectedRow ? <span>{selectedRow.client.name}</span> : null}
          </div>
        </div>

        {loadingMetrics ? (
          <StateBlock
            variant="loading"
            compact
            title="Carregando métricas"
          />
        ) : fetchError ? (
          <StateBlock
            variant="error"
            compact
            title="Métricas indisponíveis"
          />
        ) : visibleRows.length === 0 ? (
          <StateBlock
            variant="empty"
            compact
            title="Nenhum cliente encontrado"
          />
        ) : (
          <div className={styles.clientList}>
            {visibleRows.map((row) => {
              const { client, calc, priority } = row;
              const priClass =
                priority.cls === 'pri-h'
                  ? styles.high
                  : priority.cls === 'pri-m'
                  ? styles.mid
                  : priority.cls === 'pri-l'
                  ? styles.ok
                  : styles.nd;
              const gap = calc.mLuc > 0 ? Math.max(calc.mLuc - calc.fec, 0) : 0;
              const squadName =
                (squads || []).find((squad) => squad.id === client.squadId)?.name ||
                client.squadName ||
                'Sem squad';
              const active = selectedClientId === client.id;

              return (
                <button
                  key={client.id}
                  type="button"
                  className={`${styles.clientRowButton} ${active ? styles.clientRowButtonActive : ''}`.trim()}
                  onClick={() => setSelectedClientId(client.id)}
                >
                  <span className={`${styles.clientPriorityBar} ${priClass}`} />

                  <div className={styles.clientRowMain}>
                    <div className={styles.clientRowName}>{client.name}</div>
                    <div className={styles.clientRowMeta}>
                      <span>{squadName}</span>
                      {client.gestor ? <span>{client.gestor}</span> : null}
                    </div>
                  </div>

                  <div className={styles.clientRowStats}>
                    <div className={styles.clientMiniStat}>
                      <span>Fechados</span>
                      <strong>{displayInt(calc.fec)}</strong>
                    </div>
                    <div className={styles.clientMiniStat}>
                      <span>Meta</span>
                      <strong>{calc.mLuc > 0 ? displayInt(calc.mLuc) : '—'}</strong>
                    </div>
                    <div className={styles.clientMiniStat}>
                      <span>Gap</span>
                      <strong>{calc.mLuc > 0 ? displayInt(gap) : '—'}</strong>
                    </div>
                    <div className={styles.clientMiniStat}>
                      <span>Taxa</span>
                      <strong>{calc.taxa > 0 ? displayPct(calc.taxa) : '—'}</strong>
                    </div>
                  </div>

                  <div className={styles.clientRowStatus}>
                    <span className={`${styles.priBadge} ${priClass}`}>{priority.label}</span>
                    {calc.hasData ? (
                      calc.isHit ? (
                        <span className={`${styles.statusPill} ${styles.hit}`}>Meta ok</span>
                      ) : (
                        <span className={`${styles.statusPill} ${styles.miss}`}>Em risco</span>
                      )
                    ) : (
                      <span className={`${styles.statusPill} ${styles.empty}`}>Sem dados</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className={styles.legend}>
          <span className={styles.legendHigh} />
          <span>Alta {breakdown.high}</span>
          <span className={styles.legendMid} />
          <span>Média {breakdown.mid}</span>
          <span className={styles.legendOk} />
          <span>Meta ok {breakdown.ok}</span>
          <span className={styles.legendNd} />
          <span>Sem dados {breakdown.empty}</span>
        </div>
      </section>
    </div>
  );
}

