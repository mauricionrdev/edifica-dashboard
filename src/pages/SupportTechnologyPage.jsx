import { useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import Avatar from '../components/ui/Avatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getUserAvatar } from '../utils/avatarStorage.js';
import styles from './SupportTechnologyPage.module.css';

const MASTER_SUPPORT_EMAIL = 'mauricionredifica@gmail.com';
const MASTER_SUPPORT_NAME = 'mauricio nunes';

const STAR_POINTS = Array.from({ length: 54 }, (_, index) => index + 1);
const DUST_POINTS = Array.from({ length: 30 }, (_, index) => index + 1);
const ORBIT_POINTS = Array.from({ length: 18 }, (_, index) => index + 1);

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
      <section className={styles.galaxyStage} aria-label="Área de tecnologia em construção">
        <div className={styles.deepSpace} aria-hidden="true" />
        <div className={styles.nebulaField} aria-hidden="true" />
        <div className={styles.galaxyPlane} aria-hidden="true">
          <span className={styles.armOne} />
          <span className={styles.armTwo} />
          <span className={styles.armThree} />
          <span className={styles.armFour} />
          <span className={styles.galaxyCore} />
        </div>
        <div className={styles.starField} aria-hidden="true">
          {STAR_POINTS.map((point) => <span key={`estrela-${point}`} />)}
        </div>
        <div className={styles.dustField} aria-hidden="true">
          {DUST_POINTS.map((point) => <span key={`poeira-${point}`} />)}
        </div>
        <div className={styles.orbitField} aria-hidden="true">
          {ORBIT_POINTS.map((point) => <span key={`orbita-${point}`} />)}
        </div>

        <div className={styles.identityMap} aria-hidden="true">
          <span className={styles.avatarNode}>
            <Avatar
              src={avatarSrc}
              name={displayName}
              size="md"
              className={styles.ownerAvatar}
              fallbackColor={supportMaster?.avatarColor || user?.avatarColor}
            />
          </span>
          <span className={`${styles.microLabel} ${styles.labelOne}`}>mauricionrdev</span>
          <span className={`${styles.microLabel} ${styles.labelTwo}`}>Mauricio Nunes</span>
          <span className={`${styles.microLabel} ${styles.labelThree}`}>em construção</span>
          <span className={`${styles.microLabel} ${styles.labelFour}`}>suporte de tecnologia</span>
          <span className={`${styles.microLabel} ${styles.labelFive}`}>área em órbita</span>
        </div>
      </section>
    </main>
  );
}
