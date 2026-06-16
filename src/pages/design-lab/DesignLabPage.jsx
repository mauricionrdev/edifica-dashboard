import { useEffect, useMemo } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  ArrowUpRightIcon,
  BriefcaseIcon,
  ChartColumnIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon,
} from '../../components/ui/Icons.jsx';
import {
  BareBadge,
  BareButton,
  BareMetric,
  BareSurface,
} from '../../components/design-system/index.js';
import '../../styles/design-system/tokens.css';
import '../../styles/design-system/barely-there.css';
import styles from './DesignLabPage.module.css';

function fmtInt(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

function isTcvClient(client) {
  return String(client?.contractType || client?.contract_type || 'recurring').toLowerCase() === 'tcv';
}

function hasInternalCommercial(client) {
  return Boolean(client?.internalCommercial) && Boolean(String(client?.internalSeller || '').trim());
}

const roadmap = [
  {
    title: 'Clientes',
    status: 'próxima tela',
    tone: 'purple',
    description: 'Tabela densa, filtros compactos, vencimentos e segmentações TCV/Comercial Interno sem quebrar com sidebar aberta.',
  },
  {
    title: 'Squad',
    status: 'planejado',
    tone: 'info',
    description: 'Carteira, rampagem, onboard, comercial interno e indicadores usando os mesmos componentes base.',
  },
  {
    title: 'GDV',
    status: 'planejado',
    tone: 'info',
    description: 'Mesma lógica visual do Squad, sem duplicar CSS ou criar filtros fora do padrão.',
  },
  {
    title: 'Ranking',
    status: 'protegido',
    tone: 'warning',
    description: 'Refatoração posterior, preservando o pódio validado e o histórico oficial de campeões.',
  },
];

export default function DesignLabPage() {
  const {
    clients = [],
    squads = [],
    gdvs = [],
    loading = false,
    setPanelHeader,
  } = useOutletContext();

  useEffect(() => {
    setPanelHeader?.({
      title: 'Design Lab',
      description: 'Ambiente isolado para validar o novo design system antes de substituir telas em produção.',
      actions: null,
    });
  }, [setPanelHeader]);

  const stats = useMemo(() => {
    const clientList = Array.isArray(clients) ? clients : [];
    return {
      clients: clientList.length,
      squads: Array.isArray(squads) ? squads.length : 0,
      gdvs: Array.isArray(gdvs) ? gdvs.length : 0,
      tcv: clientList.filter(isTcvClient).length,
      internal: clientList.filter(hasInternalCommercial).length,
    };
  }, [clients, gdvs, squads]);

  return (
    <main className={`${styles.page} btScope`}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <BareBadge tone="purple" className={styles.heroBadge}>
            <SparklesIcon size={13} aria-hidden="true" />
            Barely There UI
          </BareBadge>

          <div className={styles.heroTitleBlock}>
            <h1>Laboratório visual da Edifica Central</h1>
            <p>
              Rotas paralelas para refatorar e validar o frontend completo sem tocar nas telas oficiais em produção.
            </p>
          </div>

          <div className={styles.heroActions}>
            <BareButton as={Link} to="/clientes" variant="ghost">
              Tela atual
              <ArrowUpRightIcon size={14} aria-hidden="true" />
            </BareButton>
            <BareButton variant="primary" type="button">
              Fundação criada
            </BareButton>
          </div>
        </div>

        <BareSurface className={styles.commandBox}>
          <div className={styles.commandInput}>
            <SearchIcon size={17} aria-hidden="true" />
            <span>Refatorar Clientes com dados reais, sem substituir /clientes</span>
          </div>
          <div className={styles.commandFooter}>
            <BareBadge>Design Lab</BareBadge>
            <BareBadge tone="success">Sem backend novo</BareBadge>
            <BareBadge tone="info">Rotas isoladas</BareBadge>
          </div>
        </BareSurface>
      </section>

      <section className={styles.metricsGrid} aria-label="Resumo real do ambiente">
        <BareMetric label="Clientes reais" value={loading ? '...' : fmtInt(stats.clients)} helper="mesma API da produção" />
        <BareMetric label="Squads" value={loading ? '...' : fmtInt(stats.squads)} helper="dados carregados no shell" />
        <BareMetric label="GDVs" value={loading ? '...' : fmtInt(stats.gdvs)} helper="dados reais" />
        <BareMetric label="TCV" value={loading ? '...' : fmtInt(stats.tcv)} helper="segmentação já existente" tone="purple" />
        <BareMetric label="Comercial Interno" value={loading ? '...' : fmtInt(stats.internal)} helper="segmentação adicional" tone="purple" />
      </section>

      <section className={styles.gridTwo}>
        <BareSurface className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <span>Próximas rotas</span>
            <h2>Refatoração sem risco de produção</h2>
          </div>

          <div className={styles.roadmapList}>
            {roadmap.map((item) => (
              <article key={item.title} className={styles.roadmapItem}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
                <BareBadge tone={item.tone}>{item.status}</BareBadge>
              </article>
            ))}
          </div>
        </BareSurface>

        <BareSurface className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <span>Componentes base</span>
            <h2>Primeira fundação visual</h2>
          </div>

          <div className={styles.componentPreview}>
            <div className="btField">
              <SearchIcon size={14} aria-hidden="true" />
              <input placeholder="Buscar cliente, squad ou responsável" aria-label="Campo de busca demonstrativo" />
            </div>

            <div className={styles.buttonRow}>
              <BareButton variant="primary" type="button">Primário</BareButton>
              <BareButton type="button">Secundário</BareButton>
              <BareButton variant="ghost" type="button">Ghost</BareButton>
            </div>

            <div className={styles.badgeRow}>
              <BareBadge tone="success">Meta batida</BareBadge>
              <BareBadge tone="warning">Vencendo</BareBadge>
              <BareBadge tone="danger">Vencido</BareBadge>
              <BareBadge tone="info">Onboard</BareBadge>
              <BareBadge tone="purple">TCV</BareBadge>
            </div>
          </div>
        </BareSurface>
      </section>

      <BareSurface className={styles.sampleTable}>
        <div className={styles.tableHead}>
          <span>Teste de densidade</span>
          <strong>Tabela Barely There</strong>
        </div>

        <div className={styles.tableGrid} role="table" aria-label="Tabela visual de teste">
          <div className={styles.tableHeader} role="row">
            <span>Área</span>
            <span>Objetivo</span>
            <span>Estado</span>
          </div>
          <div className={styles.tableRow} role="row">
            <span><BriefcaseIcon size={14} aria-hidden="true" /> Clientes</span>
            <span>Validar tabela compacta com sidebar aberta</span>
            <BareBadge tone="purple">próximo patch</BareBadge>
          </div>
          <div className={styles.tableRow} role="row">
            <span><UsersIcon size={14} aria-hidden="true" /> Squad/GDV</span>
            <span>Padronizar filtros, métricas e listas</span>
            <BareBadge tone="info">planejado</BareBadge>
          </div>
          <div className={styles.tableRow} role="row">
            <span><ChartColumnIcon size={14} aria-hidden="true" /> Ranking</span>
            <span>Preservar regras validadas antes de migrar UI</span>
            <BareBadge tone="warning">posterior</BareBadge>
          </div>
        </div>
      </BareSurface>
    </main>
  );
}
