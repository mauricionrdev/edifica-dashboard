import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { listSupportDailyRows, listWorkspaceDocuments } from '../../api/support.js';
import { BookTemplateIcon, ChecklistIcon, ShieldIcon } from '../../components/ui/Icons.jsx';
import { errorMessage, resolveName, safeInt } from './v2PageUtils.js';
import styles from './V2Operations.module.css';

function documentTitle(item) {
  return resolveName(item?.title || item?.name, 'Documento sem título');
}

function sheetName(row) {
  return resolveName(row?.sheetName || row?.sheet_name || row?.sheetTitle || row?.sheet_title || row?.sheetId || row?.sheet_id, 'Planilha principal');
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

export default function WorkspaceV2Page() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadWorkspace() {
      setLoading(true);
      setError(null);
      try {
        const [docsPayload, rowsPayload] = await Promise.allSettled([
          listWorkspaceDocuments({ ownerUserId: user?.id }),
          listSupportDailyRows(undefined, { ownerUserId: user?.id }),
        ]);
        if (cancelled) return;
        if (docsPayload.status === 'fulfilled') {
          setDocuments(Array.isArray(docsPayload.value?.documents) ? docsPayload.value.documents : Array.isArray(docsPayload.value) ? docsPayload.value : []);
        }
        if (rowsPayload.status === 'fulfilled') {
          setRows(Array.isArray(rowsPayload.value?.rows) ? rowsPayload.value.rows : Array.isArray(rowsPayload.value) ? rowsPayload.value : []);
        }
        const rejected = [docsPayload, rowsPayload].find((item) => item.status === 'rejected');
        if (rejected && docsPayload.status === 'rejected' && rowsPayload.status === 'rejected') setError(rejected.reason);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadWorkspace();
    return () => { cancelled = true; };
  }, [user?.id]);

  const sheets = useMemo(() => Array.from(new Set(rows.map(sheetName))).filter(Boolean), [rows]);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true"><BookTemplateIcon size={20} /></div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Workspace V2 · rota paralela</p>
          <h1>Leitura segura do meu espaço de trabalho</h1>
          <p>Consolida documentos e linhas de programação diária apenas em modo leitura. A rota oficial /espaco-trabalho continua intacta.</p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Sem edição</span>
      </section>

      {error ? <section className={styles.errorBox}>{errorMessage(error, 'Não foi possível carregar Workspace V2.')}</section> : null}

      <section className={styles.gridCards} aria-label="Resumo do workspace">
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Documentos</span><BookTemplateIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(documents.length)}</strong>
          <p className={styles.cardHelper}>Workspace documents do usuário autenticado</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Linhas</span><ChecklistIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(rows.length)}</strong>
          <p className={styles.cardHelper}>Programação diária em leitura</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Planilhas</span><BookTemplateIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(sheets.length)}</strong>
          <p className={styles.cardHelper}>{sheets.slice(0, 2).join(', ') || 'Sem planilha retornada'}</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Modo</span><ShieldIcon size={15} /></div>
          <strong className={styles.cardValue}>{loading ? '...' : 'GET'}</strong>
          <p className={styles.cardHelper}>Sem criar colunas, linhas ou documentos</p>
        </article>
      </section>

      <section className={styles.twoColumns}>
        <article className={styles.tablePanel}>
          <header className={styles.sectionHeader}>
            <div><p className={styles.eyebrow}>Documentos</p><h2>Conteúdo carregado</h2><p>Prévia estrutural dos documentos do workspace.</p></div>
          </header>
          <div className={styles.stackList}>
            {documents.slice(0, 14).map((item, index) => (
              <div className={styles.safeNotice} key={item?.id || index}>
                <ShieldIcon size={16} />
                <p><strong>{documentTitle(item)}</strong><br />Atualizado em {updatedAt(item)}</p>
              </div>
            ))}
            {!loading && documents.length === 0 ? <p className={styles.emptyState}>Nenhum documento retornado.</p> : null}
          </div>
        </article>
        <article className={styles.tablePanel}>
          <header className={styles.sectionHeader}>
            <div><p className={styles.eyebrow}>Programação</p><h2>Linhas recentes</h2><p>Leitura parcial da programação diária.</p></div>
          </header>
          <div className={styles.stackList}>
            {rows.slice(0, 14).map((row, index) => (
              <div className={styles.safeNotice} key={row?.id || index}>
                <ChecklistIcon size={16} />
                <p><strong>{resolveName(row?.title || row?.task || row?.description || row?.content, 'Linha sem título')}</strong><br />{sheetName(row)} · {updatedAt(row)}</p>
              </div>
            ))}
            {!loading && rows.length === 0 ? <p className={styles.emptyState}>Nenhuma linha retornada.</p> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
