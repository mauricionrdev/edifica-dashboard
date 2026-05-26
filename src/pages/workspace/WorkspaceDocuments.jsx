import { useEffect, useMemo, useState } from 'react';
import Button from '../../components/ui/Button.jsx';
import WorkspaceEmptyState from './WorkspaceEmptyState.jsx';
import styles from './WorkspaceApp.module.css';
import { formatDate } from './workspaceUtils.js';

export default function WorkspaceDocuments({ documents, onCreate, onDelete, onSave }) {
  const [activeId, setActiveId] = useState('');
  const activeDocument = useMemo(() => documents.find((document) => document.id === activeId) || documents[0] || null, [documents, activeId]);
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({ title: activeDocument?.title || '', content: activeDocument?.content || '' });
  }, [activeDocument?.id]);

  async function handleSave() {
    if (!activeDocument) return;
    setSaving(true);
    try {
      await onSave(activeDocument.id, draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.documentsLayout}>
      <aside className={styles.documentsRail}>
        <div className={styles.panelHeaderCompact}>
          <strong>Documentos</strong>
          <Button type="button" size="sm" onClick={onCreate}>Novo</Button>
        </div>
        {documents.map((document) => (
          <button key={document.id} type="button" data-active={activeDocument?.id === document.id} onClick={() => setActiveId(document.id)}>
            <strong>{document.title || 'Sem título'}</strong>
            <span>{document.updatedAt ? formatDate(document.updatedAt) : 'Sem atualização'}</span>
          </button>
        ))}
      </aside>

      <main className={styles.documentEditor}>
        {activeDocument ? (
          <>
            <div className={styles.editorActions}>
              <Button type="button" size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Salvando' : 'Salvar'}</Button>
              <Button type="button" size="sm" variant="danger" onClick={() => onDelete(activeDocument.id)}>Excluir</Button>
            </div>
            <input className={styles.documentTitle} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} aria-label="Título do documento" />
            <textarea className={styles.documentBody} value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} aria-label="Conteúdo do documento" />
          </>
        ) : (
          <WorkspaceEmptyState title="Sem documentos" />
        )}
      </main>
    </section>
  );
}
