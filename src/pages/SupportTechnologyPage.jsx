import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import styles from './SupportTechnologyPage.module.css';

const NETWORK_NODES = Array.from({ length: 20 }, (_, index) => index + 1);
const DATA_TRACES = Array.from({ length: 28 }, (_, index) => index + 1);
const ORBIT_MARKS = Array.from({ length: 18 }, (_, index) => index + 1);
const STATUS_BARS = Array.from({ length: 12 }, (_, index) => index + 1);

export default function SupportTechnologyPage() {
  const { setPanelHeader } = useOutletContext();

  useEffect(() => {
    setPanelHeader?.({ title: 'Suporte de tecnologia', description: null, actions: null });
  }, [setPanelHeader]);

  return (
    <main className={styles.page} aria-label="Suporte de tecnologia">
      <section className={styles.labStage} aria-label="Área em construção">
        <div className={styles.depthLayer} aria-hidden="true" />
        <div className={styles.gridLayer} aria-hidden="true" />
        <div className={styles.scanLayer} aria-hidden="true" />

        <div className={styles.traceField} aria-hidden="true">
          {DATA_TRACES.map((trace) => <span key={`traco-${trace}`} />)}
        </div>

        <div className={styles.nodeField} aria-hidden="true">
          {NETWORK_NODES.map((node) => <span key={`no-${node}`} />)}
        </div>

        <div className={styles.systemCore} aria-hidden="true">
          <span className={styles.coreGlow} />
          <span className={styles.coreRingOne} />
          <span className={styles.coreRingTwo} />
          <span className={styles.coreRingThree} />
          <span className={styles.coreGrid} />
          <span className={styles.corePulse} />
          <span className={styles.coreDot} />
          <span className={styles.coreOrbitOne} />
          <span className={styles.coreOrbitTwo} />
          <span className={styles.coreOrbitThree} />
          <span className={styles.coreOrbitFour} />
        </div>

        <div className={styles.orbitMarks} aria-hidden="true">
          {ORBIT_MARKS.map((mark) => <span key={`marcador-${mark}`} />)}
        </div>

        <div className={`${styles.sidePanel} ${styles.sidePanelLeft}`} aria-hidden="true">
          {STATUS_BARS.map((bar) => <span key={`barra-esquerda-${bar}`} />)}
        </div>

        <div className={`${styles.sidePanel} ${styles.sidePanelRight}`} aria-hidden="true">
          {STATUS_BARS.map((bar) => <span key={`barra-direita-${bar}`} />)}
        </div>

        <div className={styles.contentBlock}>
          <span className={styles.kicker}>Suporte de tecnologia</span>
          <h1>Em construção</h1>
        </div>
      </section>
    </main>
  );
}
