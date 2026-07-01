import { useEffect, useMemo, useState } from 'react';
import { listSupportTasks, listWorkspaceDocuments } from '../../api/support.js';
import { ChecklistIcon, SearchIcon, ShieldIcon, WrenchIcon } from '../../components/ui/Icons.jsx';
import { errorMessage, normalizeText, resolveName, safeInt } from './v2PageUtils.js';
import styles from './V2Operations.module.css';

function taskTitle(task) {
  return resolveName(task?.title || task?.name || task?.description || task?.content, 'Demanda sem título');
}

function taskStatus(task) {
  return resolveName(task?.statusLabel || task?.status_label || task?.status || task?.stage, 'Sem status');
}

function taskOwner(task) {
  return resolveName(task?.ownerName || task?.owner_name || task?.responsibleName || task?.responsible_name || task?.createdByName || task?.created_by_name, 'Sem responsável');
}

function docTitle(doc) {
  return resolveName(doc?.title || doc?.name, 'Documento sem título');
}

function updatedAt(item) {
  const value = item?.updatedAt || item?.updated_at || item?.createdAt || item?.created_at;
  if (!value) return 'Sem data';
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return String(value);
  }
}

export default function SupportV2Page() {
  const [tasks, setTasks] = useState([]);
  const [docs, setDocs] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSupport() {
      setLoading(true);
      setError(null);
      try {
        const [tasksPayload, docsPayload] = await Promise.allSettled([
          listSupportTasks(),
          listWorkspaceDocuments(),
        ]);
        if (cancelled) return;
        if (tasksPayload.status === 'fulfilled') {
          setTasks(Array.isArray(tasksPayload.value?.tasks) ? tasksPayload.value.tasks : Array.isArray(tasksPayload.value) ? tasksPayload.value : []);
        }
        if (docsPayload.status === 'fulfilled') {
          setDocs(Array.isArray(docsPayload.value?.documents) ? docsPayload.value.documents : Array.isArray(docsPayload.value) ? docsPayload.value : []);
        }
        const rejected = [tasksPayload, docsPayload].find((item) => item.status === 'rejected');
        if (rejected && tasksPayload.status === 'rejected' && docsPayload.status === 'rejected') setError(rejected.reason);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSupport();
    return () => { cancelled = true; };
  }, []);

  const filteredTasks = useMemo(() => {
    const needle = normalizeText(query);
    if (!needle) return tasks;
    return tasks.filter((task) => normalizeText([taskTitle(task), taskStatus(task), taskOwner(task)].join(' ')).includes(needle));
  }, [tasks, query]);

  const openTasks = tasks.filter((task) => !['done', 'completed', 'concluida', 'concluída', 'finalizada'].includes(String(task?.status || '').toLowerCase())).length;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true"><WrenchIcon size={20} /></div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Suporte V2 · rota paralela</p>
          <h1>Leitura segura do suporte de tecnologia</h1>
          <p>Consolida demandas e documentos do workspace usando apenas GET. Não cria demanda, não altera programação e não substitui a tela oficial.</p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Sem escrita no banco</span>
      </section>

      <section className={styles.toolbar} aria-label="Filtros de Suporte V2">
        <label className={styles.searchBox}>
          <span className={styles.fieldLabel}>Busca</span>
          <SearchIcon size={16} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Demanda, status ou responsável" />
        </label>
        <span className={styles.statusBadgeMuted}>{loading ? 'Carregando' : `${safeInt(filteredTasks.length)} demandas na visão`}</span>
      </section>

      {error ? <section className={styles.errorBox}>{errorMessage(error, 'Não foi possível carregar Suporte V2.')}</section> : null}

      <section className={styles.gridCards} aria-label="Resumo do suporte">
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Demandas</span><ChecklistIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(tasks.length)}</strong>
          <p className={styles.cardHelper}>{safeInt(openTasks)} abertas ou não finalizadas</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Documentos</span><WrenchIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(docs.length)}</strong>
          <p className={styles.cardHelper}>Workspace documents retornados</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Modo</span><ShieldIcon size={15} /></div>
          <strong className={styles.cardValue}>GET</strong>
          <p className={styles.cardHelper}>Sem alteração de programação</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Rota oficial</span><WrenchIcon size={15} /></div>
          <strong className={styles.cardValue}>Intacta</strong>
          <p className={styles.cardHelper}>/suporte-tecnologia não foi substituída</p>
        </article>
      </section>

      <section className={styles.twoColumns}>
        <article className={styles.tablePanel}>
          <header className={styles.sectionHeader}>
            <div><p className={styles.eyebrow}>Demandas</p><h2>Fila carregada</h2><p>Leitura das demandas atuais do suporte.</p></div>
            <span className={styles.statusBadgeMuted}>GET /api/support/tasks</span>
          </header>
          <div className={styles.table} role="table" aria-label="Demandas de suporte V2">
            <div className={styles.tableHead} role="row"><span>Demanda</span><span>Status</span><span>Responsável</span><span>Atualização</span><span>Origem</span></div>
            {filteredTasks.slice(0, 60).map((task, index) => (
              <div className={styles.tableRow} role="row" key={task?.id || index}>
                <span><strong>{taskTitle(task)}</strong></span>
                <span>{taskStatus(task)}</span>
                <span>{taskOwner(task)}</span>
                <span>{updatedAt(task)}</span>
                <span>{task?.source || task?.type || 'Suporte'}</span>
              </div>
            ))}
          </div>
          {!loading && filteredTasks.length === 0 ? <p className={styles.emptyState}>Nenhuma demanda retornada para os filtros atuais.</p> : null}
        </article>

        <article className={styles.tablePanel}>
          <header className={styles.sectionHeader}>
            <div><p className={styles.eyebrow}>Workspace</p><h2>Documentos</h2><p>Somente leitura dos documentos vinculados ao workspace.</p></div>
            <span className={styles.statusBadgeMuted}>GET /api/support/workspace-documents</span>
          </header>
          <div className={styles.stackList}>
            {docs.slice(0, 12).map((doc, index) => (
              <div className={styles.safeNotice} key={doc?.id || index}>
                <ShieldIcon size={16} />
                <p><strong>{docTitle(doc)}</strong><br />Atualizado em {updatedAt(doc)}</p>
              </div>
            ))}
            {!loading && docs.length === 0 ? <p className={styles.emptyState}>Nenhum documento retornado.</p> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
