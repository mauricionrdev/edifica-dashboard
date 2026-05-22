import { useEffect, useState } from 'react';
import { confirmClientBookAccess, listClientBookEntries } from '../../api/projects.js';
import Avatar from '../ui/Avatar.jsx';
import styles from './ClientTaskTabs.module.css';

function formatDateTime(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return '';
  }
}

function canConfirm(entry) {
  return ['activation_gdv', 'access_delivery', 'traffic_activation'].includes(entry?.taskStatus);
}

export default function ClientBookTab({ client }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState('');

  async function load() {
    if (!client?.id) return;
    try {
      setLoading(true);
      const res = await listClientBookEntries(client.id);
      setEntries(res?.entries || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [client?.id]);

  async function handleConfirm(entry) {
    if (!client?.id || !entry?.taskId) return;
    try {
      setConfirmingId(entry.id);
      await confirmClientBookAccess(client.id, entry.taskId);
      await load();
    } finally {
      setConfirmingId('');
    }
  }

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h3>Book do cliente</h3>
          <p>Registro operacional das tarefas vinculadas ao cliente. Comentários com acessos e confirmações ficam centralizados aqui.</p>
        </div>
      </header>

      <div className={styles.bookList}>
        {entries.map((entry) => (
          <article key={entry.id} className={styles.bookItem}>
            <div className={styles.bookTop}>
              <div className={styles.bookAuthor}>
                <Avatar src={entry.avatarUrl || undefined} name={entry.userName} size="sm" />
                <div>
                  <strong>{entry.userName}</strong>
                  <span>{formatDateTime(entry.createdAt)}</span>
                </div>
              </div>
              <div className={styles.bookTask}>
                <strong>{entry.taskTitle}</strong>
                <span>{entry.taskStatus === 'final_validation' ? 'Validação' : entry.taskStatus === 'done' ? 'Concluída' : 'Em andamento'}</span>
              </div>
            </div>
            <p className={styles.bookBody}>{entry.body}</p>
            {canConfirm(entry) ? (
              <div className={styles.bookActions}>
                <span className={styles.badge}>Aguardando GDV</span>
                <button type="button" onClick={() => handleConfirm(entry)} disabled={confirmingId === entry.id}>
                  {confirmingId === entry.id ? 'Confirmando' : 'Confirmar ativação/acessos'}
                </button>
              </div>
            ) : null}
          </article>
        ))}
        {!loading && !entries.length ? <div className={styles.empty}>Nenhum registro no book deste cliente.</div> : null}
        {loading ? <div className={styles.empty}>Carregando book...</div> : null}
      </div>
    </section>
  );
}
