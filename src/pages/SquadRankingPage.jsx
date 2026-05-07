import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { getRankingSettings, getSquadRanking, updateRankingSettings } from '../api/metrics.js';
import { CloseIcon, RotateCcwIcon, StateBlock, TargetIcon } from '../components/ui/index.js';
import { MONTHS_FULL, fmtMoney, fmtPct } from '../utils/format.js';
import { getSquadAvatar, getUserAvatar, subscribeAvatarChange } from '../utils/avatarStorage.js';
import { resolveSquadOwner } from '../utils/ownershipStorage.js';
import styles from './SquadRankingPage.module.css';

const SCORE_FORMATTER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const DEFAULT_RANKING_SETTINGS = { goalPercent: 80, churnTarget: 8 };

function normalizePercent(value, fallback = 0) {
  const normalized = String(value ?? '').replace(',', '.').trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, parsed));
}

function buildReferenceDate(year, month0) {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-15`;
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

function PodiumCard({ row, variant = 'default', maxScore = 1, onOpen }) {
  if (!row) return null;

  const relative = maxScore > 0 ? Math.max(18, (row.rankingScore / maxScore) * 100) : 18;
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

      <div className={styles.podiumScore}>{row.goalAchievementDisplay}</div>

      <div className={styles.podiumMeta}>
        <div>
          <span>Meta Lucro</span>
          <strong>{row.hitRateDisplay}</strong>
        </div>
        <div>
          <span>MRR</span>
          <strong>{fmtMoney(row.mrr)}</strong>
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
    userDirectory,
    loading: shellLoading,
    setPanelHeader,
  } = useOutletContext();

  const now = useMemo(() => new Date(), []);
  const [period] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [assetVersion, setAssetVersion] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_RANKING_SETTINGS);
  const [settingsForm, setSettingsForm] = useState({ goalPercent: '80', churnTarget: '8' });
  const [settingsSaving, setSettingsSaving] = useState(false);

  const fetchRanking = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getSquadRanking({ date: buildReferenceDate(period.y, period.m) });
      const nextSettings = response?.settings || DEFAULT_RANKING_SETTINGS;
      setSettings(nextSettings);
      setSettingsForm({
        goalPercent: String(normalizePercent(nextSettings.goalPercent, DEFAULT_RANKING_SETTINGS.goalPercent)),
        churnTarget: String(normalizePercent(nextSettings.churnTarget, DEFAULT_RANKING_SETTINGS.churnTarget)),
      });
      setRows(Array.isArray(response?.rows) ? response.rows : []);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err : new Error('Não foi possível consolidar o ranking.'));
    } finally {
      setLoading(false);
    }
  }, [period.m, period.y]);

  useEffect(() => {
    fetchRanking();
  }, [fetchRanking]);

  useEffect(() => {
    let cancelled = false;
    getRankingSettings()
      .then((response) => {
        if (cancelled) return;
        const nextSettings = response?.settings || DEFAULT_RANKING_SETTINGS;
        setSettings(nextSettings);
        setSettingsForm({
          goalPercent: String(normalizePercent(nextSettings.goalPercent, DEFAULT_RANKING_SETTINGS.goalPercent)),
          churnTarget: String(normalizePercent(nextSettings.churnTarget, DEFAULT_RANKING_SETTINGS.churnTarget)),
        });
      })
      .catch(() => null);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settingsOpen]);

  useEffect(() => subscribeAvatarChange(() => setAssetVersion((current) => current + 1)), []);

  useEffect(() => {
    setPanelHeader({
      title: <strong>Ranking de Squads</strong>,
      description: null,
      actions: (
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.headerAction}
            onClick={() => setSettingsOpen(true)}
            aria-label="Cálculo de meta"
            title="Cálculo de meta"
          >
            <TargetIcon size={14} aria-hidden="true" />
          </button>
          <button type="button" className={styles.headerAction} onClick={fetchRanking} aria-label="Atualizar ranking" title="Atualizar ranking">
            <RotateCcwIcon size={14} aria-hidden="true" />
          </button>
        </div>
      ),
    });
  }, [fetchRanking, setPanelHeader]);

  const handleSaveSettings = useCallback(async (event) => {
    event.preventDefault();
    setSettingsSaving(true);
    try {
      const payload = {
        goalPercent: normalizePercent(settingsForm.goalPercent, settings.goalPercent || DEFAULT_RANKING_SETTINGS.goalPercent),
        churnTarget: normalizePercent(settingsForm.churnTarget, settings.churnTarget || DEFAULT_RANKING_SETTINGS.churnTarget),
      };
      const response = await updateRankingSettings(payload);
      const nextSettings = response?.settings || payload;
      setSettings(nextSettings);
      setSettingsForm({
        goalPercent: String(normalizePercent(nextSettings.goalPercent, payload.goalPercent)),
        churnTarget: String(normalizePercent(nextSettings.churnTarget, payload.churnTarget)),
      });
      setSettingsOpen(false);
      await fetchRanking();
    } finally {
      setSettingsSaving(false);
    }
  }, [fetchRanking, settings.churnTarget, settings.goalPercent, settingsForm.churnTarget, settingsForm.goalPercent]);

  const rankingRows = useMemo(() => {
    const safeRows = Array.isArray(rows) ? rows : [];
    return safeRows.map((row, index) => {
      const squad = row.squad || { id: row.squadId, name: row.squadName || 'Squad' };
      const ownership = resolveSquadOwner(squad, userDirectory);
      const owner = squad.owner || ownership.owner || null;
      const ownerName = row.ownerName || owner?.name || 'Sem responsável';
      const metaIndex = Number(row.metaIndex) || 0;
      const churnRate = Number(row.churnRate) || 0;
      const hitRate = Number(row.hitRate) || 0;
      const goalAchievement = Number(row.goalAchievement) || 0;
      const rankingScore = Number(row.rankingScore) || 0;
      const displayAvatar = getSquadAvatar(squad) || getUserAvatar(owner) || '';

      return {
        ...row,
        squad,
        ownerName,
        ownerRole: row.ownerRole || owner?.role || '',
        activeClients: Number(row.activeClients) || 0,
        clientsWithGoal: Number(row.clientsWithGoal) || 0,
        mrr: Number(row.mrr) || 0,
        metaIndex,
        hitRate,
        churnRate,
        goalPercent: Number(row.goalPercent) || Number(settings.goalPercent) || DEFAULT_RANKING_SETTINGS.goalPercent,
        goalTargetClients: Number(row.goalTargetClients) || 0,
        goalAchievement,
        goalTargetHit: row.goalTargetHit === true,
        churnTarget: Number(row.churnTarget) || Number(settings.churnTarget) || DEFAULT_RANKING_SETTINGS.churnTarget,
        churnOnTarget: row.churnOnTarget !== false,
        rankingScore,
        performanceScore: Number(row.performanceScore) || 0,
        displayAvatar,
        position: Number(row.position) || index + 1,
        metaDisplay: metaIndex > 0 ? fmtPct(metaIndex) : '—',
        hitRateDisplay: hitRate > 0 ? fmtPct(hitRate) : '0,00%',
        goalAchievementDisplay: goalAchievement > 0 ? fmtPct(goalAchievement) : '0,00%',
        churnDisplay: churnRate > 0 ? fmtPct(churnRate) : '0,00%',
      };
    });
  }, [assetVersion, rows, settings.churnTarget, settings.goalPercent, userDirectory]);

  const filteredRows = rankingRows;

  const podiumRows = useMemo(() => filteredRows.slice(0, 3), [filteredRows]);
  const maxScore = useMemo(
    () => Math.max(...filteredRows.map((row) => row.rankingScore), 0),
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
            <button type="button" className={styles.inlineButton} onClick={fetchRanking}>
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
            <span>Churn</span>
            <span>Meta Ativos</span>
            <span>MRR</span>
          </div>

          {loading && !filteredRows.length ? (
            <StateBlock compact variant="loading" title="Atualizando ranking" />
          ) : filteredRows.length === 0 ? null : (
            <div className={styles.rankList}>
              {filteredRows.map((row) => {
                const relative = maxScore > 0 ? Math.max(8, (row.rankingScore / maxScore) * 100) : 8;
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

                    <strong className={styles.metricCell}>{row.churnDisplay}</strong>
                    <strong className={styles.metricCell}>{row.goalAchievementDisplay}</strong>

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

      {settingsOpen ? (
        <div className={styles.modalOverlay} onMouseDown={() => setSettingsOpen(false)}>
          <form className={styles.settingsModal} onSubmit={handleSaveSettings} onMouseDown={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <div>
                <strong>Cálculo de meta</strong>
                <span>Ranking</span>
              </div>
              <button type="button" className={styles.modalClose} onClick={() => setSettingsOpen(false)} aria-label="Fechar">
                <CloseIcon size={14} aria-hidden="true" />
              </button>
            </header>

            <div className={styles.settingsGrid}>
              <label className={styles.fieldGroup}>
                <span>Meta ativos</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={settingsForm.goalPercent}
                  onChange={(event) => setSettingsForm((current) => ({ ...current, goalPercent: event.target.value }))}
                />
              </label>
              <label className={styles.fieldGroup}>
                <span>Churn</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={settingsForm.churnTarget}
                  onChange={(event) => setSettingsForm((current) => ({ ...current, churnTarget: event.target.value }))}
                />
              </label>
            </div>

            <footer className={styles.modalFooter}>
              <button type="button" className={styles.secondaryAction} onClick={() => setSettingsOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className={styles.primaryAction} disabled={settingsSaving}>
                {settingsSaving ? 'Salvando' : 'Salvar'}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
