import { useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import Avatar from '../components/ui/Avatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getUserAvatar } from '../utils/avatarStorage.js';
import styles from './SupportTechnologyPage.module.css';

const MASTER_SUPPORT_EMAIL = 'mauricionredifica@gmail.com';
const MASTER_SUPPORT_NAME = 'mauricio nunes';

export default function SupportTechnologyPage() {
  const { user } = useAuth();
  const { userDirectory = [], setPanelHeader } = useOutletContext();

  useEffect(() => {
    setPanelHeader?.({ title: 'Suporte de tecnologia', description: null, actions: null });
  }, [setPanelHeader]);

  const supportMaster = useMemo(() => {
    const activeUsers = Array.isArray(userDirectory)
      ? userDirectory.filter((item) => item?.id && item?.active !== false)
      : [];
    const directoryMatch = activeUsers.find((item) => (
      String(item.email || '').toLowerCase() === MASTER_SUPPORT_EMAIL
      || String(item.name || '').trim().toLowerCase() === MASTER_SUPPORT_NAME
    ));
    if (directoryMatch) return directoryMatch;
    const currentUserIsMaster = (
      String(user?.email || '').toLowerCase() === MASTER_SUPPORT_EMAIL
      || String(user?.name || '').trim().toLowerCase() === MASTER_SUPPORT_NAME
    );
    return currentUserIsMaster ? user : null;
  }, [userDirectory, user]);

  const avatarSrc = getUserAvatar(supportMaster) || supportMaster?.avatarUrl || getUserAvatar(user) || undefined;
  const displayName = supportMaster?.name || user?.name || 'Mauricio Nunes';

  return (
    <main className={styles.page} aria-label="Suporte de tecnologia">
      <section className={styles.bladeStage} aria-label="Área de tecnologia em construção">
        <div className={styles.rainLayer} aria-hidden="true" />
        <div className={styles.cityGlow} aria-hidden="true" />
        <div className={styles.cityBack} aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span /><span />
        </div>
        <div className={styles.cityFront} aria-hidden="true">
          <span /><span /><span /><span /><span /><span />
        </div>
        <div className={styles.lightBeamOne} aria-hidden="true" />
        <div className={styles.lightBeamTwo} aria-hidden="true" />
        <div className={styles.signalGrid} aria-hidden="true" />
        <div className={styles.scanLines} aria-hidden="true" />
        <div className={styles.holoRing} aria-hidden="true">
          <span /><span /><span />
        </div>

        <div className={styles.centerpiece}>
          <div className={styles.avatarShell} aria-hidden="true">
            <span className={styles.avatarAura} />
            <Avatar
              src={avatarSrc}
              name={displayName}
              size="xl"
              className={styles.centerAvatar}
              fallbackColor={supportMaster?.avatarColor || user?.avatarColor}
            />
            <span className={styles.avatarScan} />
          </div>
          <span className={styles.kicker}>TECHNOLOGY SUPPORT</span>
          <h1>mauricionrdev</h1>
          <p>Em construção</p>
        </div>

        <div className={styles.hudLeft} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className={styles.hudRight} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
    </main>
  );
}
