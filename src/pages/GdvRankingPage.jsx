import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { getGdvRanking } from '../api/metrics.js';
import { Button, RotateCcwIcon, StateBlock } from '../components/ui/index.js';
import { MONTHS_FULL, fmtMoney, fmtPct } from '../utils/format.js';
import { getGdvAvatar, getUserAvatar, subscribeAvatarChange } from '../utils/avatarStorage.js';
import styles from './SquadRankingPage.module.css';

function buildReferenceDate(year, month0) {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-15`;
}

function periodKey(year, month0) {
  return `${year}-${String(month0 + 1).padStart(2, '0')}`;
}

function buildPeriodOptions(baseDate = new Date(), count = 12) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(baseDate.getFullYear(), baseDate.getMonth() - index, 1));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth();
    return {
      value: periodKey(y, m),
      y,
      m,
      label: `${MONTHS_FULL[m]} de ${y}`,
    };
  });
}

function leaderInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'GD';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function rankLabel(position) {
  return String(position).padStart(2, '0');
}

function clampProgress(value) {
  const n = Number(value) || 0;
  if (n <= 0) return 0;
  return Math.min(100, Math.max(3, n));
}

function targetBarProgress(progress, goalPercent) {
  const safeGoal = Math.max(1, Number(goalPercent) || 80);
  const safeProgress = Math.max(0, Number(progress) || 0);
  return clampProgress((safeProgress / safeGoal) * 100);
}

function PodiumCard({ row, variant = 'default', onOpen }) {
  if (!row) return null;

  const relative = targetBarProgress(row.metaActiveProgress, row.goalPercent);
  const avatarLabel = row.ownerName || row.gdv.name;

  return (
    <button
      type="button"
      className={`${styles.podiumCard} ${styles[`podiumCard_${variant}`] || ''}`.trim()}
      onClick={() => onOpen(row.gdv)}
    >
      <span className={styles.podiumGhostRank}>{row.position}</span>
      <span className={styles.podiumRank}>{rankLabel(row.position)}</span>
      {row.position === 1 ? <span className={styles.podiumTag}>Destaque</span> : null}
      {row.position === 1 ? <span className={styles.podiumCrown} aria-hidden="true">♛</span> : null}

      <div className={styles.podiumAvatarWrap}>
        <div className={styles.podiumAvatar}>
          {row.displayAvatar ? (
            <img src={row.displayAvatar} alt="" />
          ) : (
            <span>{leaderInitials(avatarLabel)}</span>
          )}
        </div>
      </div>

      <div className={styles.podiumIdentity}>
        <strong>{row.gdv.name}</strong>
        <span>{row.ownerName}</span>
      </div>

      <div className={styles.podiumScore}>{row.metaActiveDisplay}</div>
      <div className={styles.podiumForecast}>
        <span>Previsto</span>
        <strong>{row.predictedGoalDisplay}</strong>
      </div>

      <div className={styles.podiumMeta}>
        <div>
          <span>Meta Lucro</span>
          <strong>{row.metaActiveDisplay}</strong>
        </div>
        <div>
          <span>Churn</span>
          <strong>{row.churnDisplay}</strong>
        </div>
      </div>

      <div className={styles.podiumBar} aria-hidden="true">
        <span style={{ width: `${relative}%` }} />
      </div>
    </button>
  );
}

export default function GdvRankingPage() {
  const navigate = useNavigate();
  const {
    loading: shellLoading,
    setPanelHeader,
  } = useOutletContext();

  const now = useMemo(() => new Date(), []);
  const periodOptions = useMemo(() => buildPeriodOptions(now, 12), [now]);
  const [period, setPeriod] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodFilterRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [rankingSettings, setRankingSettings] = useState({ goalPercent: 80, churnTarget: 8 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [assetVersion, setAssetVersion] = useState(0);

  const fetchRanking = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getGdvRanking({ date: buildReferenceDate(period.y, period.m) });
      setRows(Array.isArray(response?.rows) ? response.rows : []);
      setRankingSettings({
        goalPercent: Number(response?.settings?.goalPercent ?? response?.goalPercent) || 80,
        churnTarget: Number(response?.settings?.churnTarget ?? response?.churnTarget) || 8,
      });
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err : new Error('Não foi possível consolidar o ranking de GDVs.'));
    } finally {
      setLoading(false);
    }
  }, [period.m, period.y]);

  const selectedPeriodLabel = useMemo(() => {
    const currentKey = periodKey(period.y, period.m);
    return periodOptions.find((option) => option.value === currentKey)?.label || `${MONTHS_FULL[period.m]} de ${period.y}`;
  }, [period.m, period.y, periodOptions]);

  const handlePeriodSelect = useCallback((option) => {
    if (!option) return;
    setPeriod({ y: option.y, m: option.m });
    setPeriodOpen(false);
  }, []);

  useEffect(() => {
    fetchRanking();
  }, [fetchRanking]);

  useEffect(() => subscribeAvatarChange(() => setAssetVersion((current) => current + 1)), []);

  useEffect(() => {
    if (!periodOpen) return undefined;

    const onPointerDown = (event) => {
      if (periodFilterRef.current && !periodFilterRef.current.contains(event.target)) {
        setPeriodOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setPeriodOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [periodOpen]);

  useEffect(() => {
    setPanelHeader({
      title: <strong>Ranking de GDVs</strong>,
      description: null,
      actions: (
        <div className={styles.headerActions}>
          <div className={styles.topbarPeriodFilter} ref={periodFilterRef}>
            <button
              type="button"
              className={styles.periodButton}
              onClick={() => setPeriodOpen((current) => !current)}
              aria-label="Selecionar mês do ranking de GDVs"
              aria-expanded={periodOpen}
            >
              <span>{selectedPeriodLabel}</span>
              <strong aria-hidden="true">⌄</strong>
            </button>

            {periodOpen ? (
              <div className={styles.periodPanel} role="listbox" aria-label="Meses do ranking de GDVs">
                {periodOptions.map((option) => {
                  const active = option.value === periodKey(period.y, period.m);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`${styles.periodItem} ${active ? styles.periodItemActive : ''}`.trim()}
                      onClick={() => handlePeriodSelect(option)}
                      role="option"
                      aria-selected={active}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" iconOnly className={styles.headerAction} onClick={fetchRanking} aria-label="Atualizar ranking" title="Atualizar ranking">
            <RotateCcwIcon size={14} aria-hidden="true" />
          </Button>
        </div>
      ),
    });
  }, [fetchRanking, handlePeriodSelect, period.m, period.y, periodOpen, periodOptions, selectedPeriodLabel, setPanelHeader]);

  const rankingRows = useMemo(() => {
    const safeRows = Array.isArray(rows) ? rows : [];
    return safeRows.map((row, index) => {
      const gdv = row.gdv || { id: row.gdvId, name: row.gdvName || 'GDV' };
      const owner = gdv.owner || null;
      const ownerName = row.ownerName || owner?.name || gdv.name || 'Sem responsável';
      const rankingGoalClients = Number(row.rankingGoalClients ?? row.clientsWithGoal) || 0;
      const rankingGoalBaseClients = Number(row.rankingGoalBaseClients ?? row.activeClients) || 0;
      const predictedGoalClients = Number(row.predictedGoalClients ?? row.projectedGoalClients) || 0;
      const predictedGoalBaseClients = Number(row.predictedGoalBaseClients ?? row.projectedGoalBaseClients ?? rankingGoalBaseClients) || 0;
      const directMetaActiveProgress = rankingGoalBaseClients > 0 ? (rankingGoalClients / rankingGoalBaseClients) * 100 : 0;
      const metaActiveProgress = rankingGoalBaseClients > 0
        ? directMetaActiveProgress
        : (Number(row.metaActiveProgress ?? row.metaIndex) || 0);
      const directPredictedGoalProgress = predictedGoalBaseClients > 0 ? (predictedGoalClients / predictedGoalBaseClients) * 100 : 0;
      const predictedGoalProgress = predictedGoalBaseClients > 0
        ? directPredictedGoalProgress
        : (Number(row.predictedGoalProgress ?? row.projectedGoalProgress) || 0);
      const churnRate = Number(row.churnRate) || 0;
      const goalPercent = Number(row.goalPercent ?? rankingSettings.goalPercent) || 80;
      const displayAvatar = getGdvAvatar(gdv) || getUserAvatar(owner) || gdv.logoUrl || '';

      return {
        ...row,
        gdv,
        ownerName,
        ownerRole: row.ownerRole || owner?.role || '',
        activeClients: Number(row.activeClients) || 0,
        clientsWithGoal: rankingGoalClients,
        rankingGoalClients,
        rankingGoalBaseClients,
        predictedGoalClients,
        predictedGoalBaseClients,
        projectedGoalClients: predictedGoalClients,
        projectedGoalBaseClients: predictedGoalBaseClients,
        mrr: Number(row.mrr) || 0,
        metaActiveProgress,
        predictedGoalProgress,
        projectedGoalProgress: predictedGoalProgress,
        goalPercent,
        churnRate,
        churnTarget: Number(row.churnTarget ?? rankingSettings.churnTarget) || 8,
        displayAvatar,
        position: Number(row.position) || index + 1,
        metaActiveDisplay: metaActiveProgress > 0 ? fmtPct(metaActiveProgress) : '0,00%',
        predictedGoalDisplay: predictedGoalProgress > 0 ? fmtPct(predictedGoalProgress) : '0,00%',
        churnDisplay: churnRate > 0 ? fmtPct(churnRate) : '0,00%',
      };
    });
  }, [assetVersion, rankingSettings.churnTarget, rankingSettings.goalPercent, rows]);

  const filteredRows = rankingRows;
  const podiumRows = useMemo(() => filteredRows.slice(0, 3), [filteredRows]);
  const maxMrr = useMemo(
    () => Math.max(...filteredRows.map((row) => Number(row.mrr) || 0), 0),
    [filteredRows]
  );

  const openGdv = useCallback(
    (gdv) => {
      const target = gdv?.slug || gdv?.id || gdv?.name || '';
      if (!target) return;
      navigate(`/gdvs/${encodeURIComponent(target)}`);
    },
    [navigate]
  );

  if (shellLoading && !rankingRows.length) {
    return (
      <div className={styles.page}>
        <StateBlock variant="loading" title="Carregando ranking de GDVs" />
      </div>
    );
  }

  if (error && !rankingRows.length) {
    return (
      <div className={styles.page}>
        <StateBlock
          variant="error"
          title="Erro ao montar o ranking de GDVs"
          action={
            <Button variant="secondary" size="sm" className={styles.inlineButton} onClick={fetchRanking}>
              Tentar novamente
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.surface}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <h1>Ranking GDVs</h1>
            <p>Resultado realizado e previsão dos GDVs em {MONTHS_FULL[period.m]} de {period.y}.</p>
          </div>
        </header>

        <section className={styles.podiumSection}>
          {loading && !filteredRows.length ? (
            <StateBlock compact variant="loading" title="Atualizando ranking" />
          ) : filteredRows.length === 0 ? (
            <StateBlock compact variant="empty" title="Nenhum GDV encontrado" />
          ) : (
            <div className={styles.podiumGrid}>
              <PodiumCard row={podiumRows[1]} variant="runnerUp" onOpen={openGdv} />
              <PodiumCard row={podiumRows[0]} variant="champion" onOpen={openGdv} />
              <PodiumCard row={podiumRows[2]} variant="third" onOpen={openGdv} />
            </div>
          )}
        </section>

        <section className={styles.listSection}>
          <div className={styles.columns}>
            <span>Rank</span>
            <span>Líder</span>
            <span>GDV</span>
            <span>Churn</span>
            <span>Meta Lucro</span>
            <span>Previsto</span>
            <span>MRR</span>
          </div>

          {loading && !filteredRows.length ? (
            <StateBlock compact variant="loading" title="Atualizando ranking" />
          ) : filteredRows.length === 0 ? null : (
            <div className={styles.rankList}>
              {filteredRows.map((row) => {
                const relative = maxMrr > 0 ? Math.max(8, (row.mrr / maxMrr) * 100) : 8;
                return (
                  <button
                    key={row.gdv.id}
                    type="button"
                    className={styles.rankRow}
                    onClick={() => openGdv(row.gdv)}
                  >
                    <strong className={styles.rankNumber}>{rankLabel(row.position)}</strong>

                    <div className={styles.leaderCell}>
                      <div className={styles.listAvatar}>
                        {row.displayAvatar ? (
                          <img src={row.displayAvatar} alt="" />
                        ) : (
                          <span>{leaderInitials(row.ownerName)}</span>
                        )}
                      </div>
                      <div className={styles.leaderInfo}>
                        <strong>{row.ownerName}</strong>
                        <span>{row.ownerRole || `${row.activeClients} ativos`}</span>
                      </div>
                    </div>

                    <div className={styles.squadCell}>
                      <strong>{row.gdv.name}</strong>
                      <span>{fmtMoney(row.mrr)} MRR</span>
                    </div>

                    <strong className={styles.metricCell}>{row.churnDisplay}</strong>
                    <strong className={styles.metricCell}>{row.metaActiveDisplay}</strong>
                    <strong className={`${styles.metricCell} ${styles.predictedMetric}`.trim()}>{row.predictedGoalDisplay}</strong>

                    <div className={styles.scoreCell}>
                      <strong>{fmtMoney(row.mrr)}</strong>
                      <span className={styles.scoreBar}>
                        <span style={{ width: `${relative}%` }} />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
