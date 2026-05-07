import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { getRankingSettings, getSquadRanking, updateRankingSettings } from '../api/metrics.js';
import { CalculatorIcon, CloseIcon, RotateCcwIcon, StateBlock } from '../components/ui/index.js';
import { MONTHS_FULL, fmtMoney, fmtPct } from '../utils/format.js';
import { getSquadAvatar, getUserAvatar, subscribeAvatarChange } from '../utils/avatarStorage.js';
import { resolveSquadOwner } from '../utils/ownershipStorage.js';
import styles from './SquadRankingPage.module.css';

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

function clampProgress(value) {
  const n = Number(value) || 0;
  if (n <= 0) return 0;
  return Math.min(100, Math.max(3, n));
}

function normalizePercentInput(value, fallback) {
  const n = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

function PodiumCard({ row, variant = 'default', onOpen }) {
  if (!row) return null;

  const relative = clampProgress(row.metaActiveProgress);
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

      <div className={styles.podiumScore}>{row.metaActiveDisplay}</div>

      <div className={styles.podiumMeta}>
        <div>
          <span>Meta Ativos</span>
          <strong>{row.metaActiveDisplay}</strong>
        </div>
        <div>
          <span>MRR</span>
          <strong>{fmtMoney(row.mrr)}</strong>
        </div>
      </div>

      <div className={styles.podiumBar} aria-hidden="true">
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
  const [rankingSettings, setRankingSettings] = useState({ goalPercent: 80, churnTarget: 8 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ goalPercent: '80', churnTarget: '8' });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [assetVersion, setAssetVersion] = useState(0);

  const syncSettings = useCallback((settings) => {
    const next = {
      goalPercent: normalizePercentInput(settings?.goalPercent, 80),
      churnTarget: normalizePercentInput(settings?.churnTarget, 8),
    };
    setRankingSettings(next);
    setSettingsForm({
      goalPercent: String(next.goalPercent),
      churnTarget: String(next.churnTarget),
    });
  }, []);

  const fetchRanking = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getSquadRanking({ date: buildReferenceDate(period.y, period.m) });
      setRows(Array.isArray(response?.rows) ? response.rows : []);
      if (response?.settings || response?.goalPercent !== undefined || response?.churnTarget !== undefined) {
        syncSettings(response.settings || response);
      }
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err : new Error('Não foi possível consolidar o ranking.'));
    } finally {
      setLoading(false);
    }
  }, [period.m, period.y, syncSettings]);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await getRankingSettings();
      syncSettings(response?.settings || response);
    } catch {
      // O ranking também devolve as configurações. Falha isolada aqui não deve quebrar a tela validada.
    }
  }, [syncSettings]);

  useEffect(() => {
    fetchRanking();
    fetchSettings();
  }, [fetchRanking, fetchSettings]);

  useEffect(() => subscribeAvatarChange(() => setAssetVersion((current) => current + 1)), []);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settingsOpen]);

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
            <CalculatorIcon size={14} aria-hidden="true" />
          </button>
          <button type="button" className={styles.headerAction} onClick={fetchRanking} aria-label="Atualizar ranking" title="Atualizar ranking">
            <RotateCcwIcon size={14} aria-hidden="true" />
          </button>
        </div>
      ),
    });
  }, [fetchRanking, setPanelHeader]);

  const rankingRows = useMemo(() => {
    const safeRows = Array.isArray(rows) ? rows : [];
    return safeRows.map((row, index) => {
      const squad = row.squad || { id: row.squadId, name: row.squadName || 'Squad' };
      const ownership = resolveSquadOwner(squad, userDirectory);
      const owner = squad.owner || ownership.owner || null;
      const ownerName = row.ownerName || owner?.name || 'Sem responsável';
      const metaIndex = Number(row.metaIndex) || 0;
      const metaActiveProgress = Number(row.metaActiveProgress ?? row.metaIndex) || 0;
      const churnRate = Number(row.churnRate) || 0;
      const hitRate = Number(row.hitRate) || 0;
      const rankingScore = Number(row.rankingScore) || 0;
      const goalPercent = Number(row.goalPercent ?? rankingSettings.goalPercent) || 80;
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
        metaActiveProgress,
        metaActiveClosed: Number(row.metaActiveClosed) || 0,
        metaActiveGoal: Number(row.metaActiveGoal) || 0,
        goalPercent,
        goalOnTarget: row.goalOnTarget === true || metaActiveProgress >= goalPercent,
        hitRate,
        churnRate,
        churnTarget: Number(row.churnTarget ?? rankingSettings.churnTarget) || 8,
        churnOnTarget: row.churnOnTarget !== false,
        rankingScore,
        performanceScore: Number(row.performanceScore) || 0,
        displayAvatar,
        position: Number(row.position) || index + 1,
        metaDisplay: metaIndex > 0 ? fmtPct(metaIndex) : '0,00%',
        metaActiveDisplay: metaActiveProgress > 0 ? fmtPct(metaActiveProgress) : '0,00%',
        hitRateDisplay: hitRate > 0 ? fmtPct(hitRate) : '0,00%',
        churnDisplay: churnRate > 0 ? fmtPct(churnRate) : '0,00%',
      };
    });
  }, [assetVersion, rankingSettings.churnTarget, rankingSettings.goalPercent, rows, userDirectory]);

  const filteredRows = rankingRows;

  const podiumRows = useMemo(() => filteredRows.slice(0, 3), [filteredRows]);
  const maxMrr = useMemo(
    () => Math.max(...filteredRows.map((row) => Number(row.mrr) || 0), 0),
    [filteredRows]
  );

  const openSquad = useCallback(
    (squadId) => navigate(`/squads/${encodeURIComponent(squadId)}`),
    [navigate]
  );

  const handleSaveSettings = useCallback(async (event) => {
    event.preventDefault();
    const goalPercent = normalizePercentInput(settingsForm.goalPercent, rankingSettings.goalPercent);
    const churnTarget = normalizePercentInput(settingsForm.churnTarget, rankingSettings.churnTarget);
    if (goalPercent <= 0) {
      setSettingsError(new Error('Meta ativos deve ser maior que zero.'));
      return;
    }

    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const response = await updateRankingSettings({ goalPercent, churnTarget });
      syncSettings(response?.settings || response);
      setSettingsOpen(false);
      await fetchRanking();
    } catch (err) {
      setSettingsError(err instanceof Error ? err : new Error('Não foi possível salvar.'));
    } finally {
      setSettingsSaving(false);
    }
  }, [fetchRanking, rankingSettings.churnTarget, rankingSettings.goalPercent, settingsForm.churnTarget, settingsForm.goalPercent, syncSettings]);

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
              <PodiumCard row={podiumRows[1]} variant="runnerUp" onOpen={openSquad} />
              <PodiumCard row={podiumRows[0]} variant="champion" onOpen={openSquad} />
              <PodiumCard row={podiumRows[2]} variant="third" onOpen={openSquad} />
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
                const relative = maxMrr > 0 ? Math.max(8, (row.mrr / maxMrr) * 100) : 8;
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
                    <strong className={styles.metricCell}>{row.metaActiveDisplay}</strong>

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
        <div className={styles.settingsOverlay} role="presentation" onClick={() => setSettingsOpen(false)}>
          <form className={styles.settingsModal} onClick={(event) => event.stopPropagation()} onSubmit={handleSaveSettings}>
            <header className={styles.settingsHeader}>
              <div>
                <h2>Cálculo de meta</h2>
                <span>{MONTHS_FULL[period.m]} {period.y}</span>
              </div>
              <button type="button" className={styles.settingsClose} onClick={() => setSettingsOpen(false)} aria-label="Fechar">
                <CloseIcon size={16} aria-hidden="true" />
              </button>
            </header>

            <div className={styles.settingsGrid}>
              <label>
                <span>Meta ativos</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="0.01"
                  value={settingsForm.goalPercent}
                  onChange={(event) => setSettingsForm((current) => ({ ...current, goalPercent: event.target.value }))}
                />
              </label>
              <label>
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

            {settingsError ? <p className={styles.settingsError}>{settingsError.message}</p> : null}

            <footer className={styles.settingsFooter}>
              <button type="button" onClick={() => setSettingsOpen(false)} disabled={settingsSaving}>Cancelar</button>
              <button type="submit" disabled={settingsSaving}>{settingsSaving ? 'Salvando' : 'Salvar'}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
