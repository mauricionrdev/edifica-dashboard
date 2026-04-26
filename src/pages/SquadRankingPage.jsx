import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { getContractsSummary } from '../api/metrics.js';
import { ApiError } from '../api/client.js';
import { StateBlock } from '../components/ui/index.js';
import { computeCentralMetrics } from '../utils/centralMetrics.js';
import { MONTHS_FULL, fmtMoney, fmtPct } from '../utils/format.js';
import { getSquadAvatar, getUserAvatar, subscribeAvatarChange } from '../utils/avatarStorage.js';
import { resolveSquadOwner } from '../utils/ownershipStorage.js';
import styles from './SquadRankingPage.module.css';

const SCORE_FORMATTER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

function buildReferenceDate(year, month0) {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-15`;
}

function squadInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'SQ';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function leaderInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'LD';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function rankLabel(position) {
  return String(position).padStart(2, '0');
}

function formatScore(value) {
  return SCORE_FORMATTER.format(Math.max(0, Math.round(Number(value) || 0)));
}

function computePerformanceScore({ mrr, metaIndex, churnRate, activeClients }) {
  const safeMrr = Math.max(0, Number(mrr) || 0);
  const safeMeta = Math.max(0, Number(metaIndex) || 0);
  const safeChurn = Math.max(0, Number(churnRate) || 0);
  const safeActive = Math.max(0, Number(activeClients) || 0);
  if (safeMrr <= 0 || safeActive <= 0 || safeMeta <= 0) return 0;

  const targetFactor = safeMeta / 100;
  const retentionFactor = Math.max(0, 1 - safeChurn / 100);
  return Math.round(safeMrr * targetFactor * retentionFactor);
}

function PodiumCard({ row, variant = 'default', maxScore = 1, onOpen }) {
  if (!row) return null;

  const relative = maxScore > 0 ? Math.max(18, (row.performanceScore / maxScore) * 100) : 18;
  const avatarLabel = row.ownerName || row.squad.name;

  return (
    <button
      type="button"
      className={`${styles.podiumCard} ${styles[`podiumCard_${variant}`] || ''}`.trim()}
      onClick={() => onOpen(row.squad.id)}
    >
      <span className={styles.podiumGhostRank}>{row.position}</span>
      <span className={styles.podiumRank}>{rankLabel(row.position)}</span>
      {row.position === 1 ? <span className={styles.podiumTag}>Destaque</span> : null}

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
        <strong>{row.squad.name}</strong>
        <span>{row.ownerName}</span>
      </div>

      <div className={styles.podiumScore}>{formatScore(row.performanceScore)}</div>

      <div className={styles.podiumMeta}>
        <div>
          <span>Meta</span>
          <strong>{row.metaDisplay}</strong>
        </div>
        <div>
          <span>Churn</span>
          <strong>{row.churnDisplay}</strong>
        </div>
      </div>

      <div className={styles.podiumBar}>
        <span style={{ width: `${relative}%` }} />
      </div>
    </button>
  );
}

export default function SquadRankingPage() {
  const navigate = useNavigate();
  const {
    squads,
    clients,
    userDirectory,
    loading: shellLoading,
    setPanelHeader,
  } = useOutletContext();

  const now = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const [summaries, setSummaries] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [assetVersion, setAssetVersion] = useState(0);
  const fetchGenRef = useRef(0);

  const fetchSummaries = useCallback(async () => {
    const safeSquads = Array.isArray(squads) ? squads : [];
    if (!safeSquads.length) {
      setSummaries({});
      return;
    }

    const refDate = buildReferenceDate(period.y, period.m);
    const gen = ++fetchGenRef.current;
    setLoading(true);
    setError(null);

    const settled = await Promise.allSettled(
      safeSquads.map(async (squad) => {
        const response = await getContractsSummary({ squadId: squad.id, date: refDate });
        return [squad.id, response];
      })
    );

    if (fetchGenRef.current !== gen) return;

    const next = {};
    let failure = null;

    settled.forEach((result) => {
      if (result.status === 'fulfilled') {
        const [squadId, response] = result.value;
        next[squadId] = response;
        return;
      }

      const reason = result.reason;
      if (!(reason instanceof ApiError && reason.status === 401) && !failure) {
        failure = reason instanceof Error ? reason : new Error('Não foi possível consolidar o ranking.');
      }
    });

    setSummaries(next);
    setError(failure);
    setLoading(false);
  }, [period.m, period.y, squads]);

  useEffect(() => {
    fetchSummaries();
  }, [fetchSummaries]);

  useEffect(() => subscribeAvatarChange(() => setAssetVersion((current) => current + 1)), []);

  useEffect(() => {
    setPanelHeader({
      title: <strong>Ranking de Squads</strong>,
      actions: (
        <button type="button" className={styles.headerAction} onClick={fetchSummaries}>
          Atualizar
        </button>
      ),
    });
  }, [fetchSummaries, setPanelHeader]);

  const rankingRows = useMemo(() => {
    const safeSquads = Array.isArray(squads) ? squads : [];
    const safeClients = Array.isArray(clients) ? clients : [];

    return safeSquads
      .map((squad) => {
        const squadClients = safeClients.filter((client) => client?.squadId === squad.id);
        const executive = computeCentralMetrics(squadClients, period.y, period.m);
        const summary = summaries[squad.id];
        const totals = summary?.totals || {};
        const ownership = resolveSquadOwner(squad, userDirectory);
        const metaIndex = Number(totals.monthProgress) || 0;
        const performanceScore = computePerformanceScore({
          mrr: executive.mrr,
          metaIndex,
          churnRate: executive.churnRate,
          activeClients: executive.active,
        });
        const displayAvatar = getSquadAvatar(squad) || getUserAvatar(ownership.owner) || '';

        return {
          squad,
          ownerName: ownership.owner?.name || 'Sem responsável',
          ownerRole: ownership.owner?.role || '',
          activeClients: executive.active,
          clientsWithGoal: Number(totals.clientsWithGoal) || 0,
          mrr: Number(executive.mrr) || 0,
          metaIndex,
          hitRate: Number(totals.hitRateMonth) || 0,
          churnRate: Number(executive.churnRate) || 0,
          performanceScore,
          displayAvatar,
          metaDisplay: metaIndex > 0 ? fmtPct(metaIndex) : '—',
          churnDisplay: executive.churnRate > 0 ? fmtPct(executive.churnRate) : '0,00%',
        };
      })
      .sort((a, b) => {
        const scoreDiff = b.performanceScore - a.performanceScore;
        if (scoreDiff) return scoreDiff;
        if (b.metaIndex !== a.metaIndex) return b.metaIndex - a.metaIndex;
        if (a.churnRate !== b.churnRate) return a.churnRate - b.churnRate;
        if (b.mrr !== a.mrr) return b.mrr - a.mrr;
        return String(a.squad.name || '').localeCompare(String(b.squad.name || ''), 'pt-BR');
      })
      .map((row, index) => ({ ...row, position: index + 1 }));
  }, [assetVersion, clients, period.m, period.y, squads, summaries, userDirectory]);

  const filteredRows = rankingRows;

  const podiumRows = useMemo(() => filteredRows.slice(0, 3), [filteredRows]);
  const maxScore = useMemo(
    () => Math.max(...filteredRows.map((row) => row.performanceScore), 0),
    [filteredRows]
  );

  const openSquad = useCallback(
    (squadId) => navigate(`/squads/${encodeURIComponent(squadId)}`),
    [navigate]
  );

  if (shellLoading && !rankingRows.length) {
    return (
      <div className={styles.page}>
        <StateBlock variant="loading" title="Carregando ranking" />
      </div>
    );
  }

  if (error && !rankingRows.length) {
    return (
      <div className={styles.page}>
        <StateBlock
          variant="error"
          title="Erro ao montar o ranking"
          action={
            <button type="button" className={styles.inlineButton} onClick={fetchSummaries}>
              Tentar novamente
            </button>
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
            <h1>Ranking Squads</h1>
            <p>Performance real dos squads em {MONTHS_FULL[period.m]} de {period.y}.</p>
          </div>
        </header>

        <section className={styles.podiumSection}>
          {loading && !filteredRows.length ? (
            <StateBlock compact variant="loading" title="Atualizando ranking" />
          ) : filteredRows.length === 0 ? (
            <StateBlock compact variant="empty" title="Nenhum squad encontrado" />
          ) : (
            <div className={styles.podiumGrid}>
              <PodiumCard row={podiumRows[1]} variant="runnerUp" maxScore={maxScore} onOpen={openSquad} />
              <PodiumCard row={podiumRows[0]} variant="champion" maxScore={maxScore} onOpen={openSquad} />
              <PodiumCard row={podiumRows[2]} variant="third" maxScore={maxScore} onOpen={openSquad} />
            </div>
          )}
        </section>

        <section className={styles.listSection}>
          <div className={styles.columns}>
            <span>Rank</span>
            <span>Líder</span>
            <span>Squad</span>
            <span>Meta</span>
            <span>Churn</span>
            <span>Score</span>
          </div>

          {loading && !filteredRows.length ? (
            <StateBlock compact variant="loading" title="Atualizando ranking" />
          ) : filteredRows.length === 0 ? null : (
            <div className={styles.rankList}>
              {filteredRows.map((row) => {
                const relative = maxScore > 0 ? Math.max(8, (row.performanceScore / maxScore) * 100) : 8;
                return (
                  <button
                    key={row.squad.id}
                    type="button"
                    className={styles.rankRow}
                    onClick={() => openSquad(row.squad.id)}
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
                      <strong>{row.squad.name}</strong>
                      <span>{fmtMoney(row.mrr)} MRR</span>
                    </div>

                    <strong className={styles.metricCell}>{row.metaDisplay}</strong>
                    <strong className={styles.metricCell}>{row.churnDisplay}</strong>

                    <div className={styles.scoreCell}>
                      <strong>{formatScore(row.performanceScore)}</strong>
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
