import { useEffect, useRef, useState } from 'react';
import { deleteClientFile, listClientFiles, uploadClientFile } from '../../api/clients.js';
import { ApiError } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PlusIcon, TrashIcon } from '../../components/ui/Icons.jsx';
import styles from './DesignLabClientDrivePanel.module.css';

const MAX_FILE_BYTES = 100 * 1024 * 1024;

function formatBytes(value) {
  const size = Number(value) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

export default function DesignLabClientDrivePanel({ client, canEdit = false }) {
  const { showToast } = useToast();
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!client?.id) return;
      setLoading(true);
      try {
        const response = await listClientFiles(client.id);
        if (active) setFiles(Array.isArray(response?.files) ? response.files : []);
      } catch (error) {
        if (active) showToast(error?.message || 'Não foi possível carregar os arquivos.', { variant: 'error' });
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [client?.id, showToast]);

  async function handleFiles(fileList) {
    if (!canEdit || !client?.id || uploading) return;

    const nextFiles = Array.from(fileList || []).filter(Boolean);
    if (nextFiles.length === 0) return;

    setUploading(true);
    try {
      const uploaded = [];
      for (const file of nextFiles) {
        if (file.size > MAX_FILE_BYTES) {
          showToast(`${file.name} ultrapassa 100 MB.`, { variant: 'error' });
          continue;
        }

        const dataUrl = await fileToDataUrl(file);
        const response = await uploadClientFile(client.id, {
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          dataUrl,
        });

        if (response?.file) uploaded.push(response.file);
      }

      if (uploaded.length > 0) {
        setFiles((current) => [...uploaded, ...current]);
        showToast(uploaded.length === 1 ? 'Arquivo anexado.' : 'Arquivos anexados.', { variant: 'success' });
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Não foi possível anexar o arquivo.';
      showToast(message, { variant: 'error' });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove(fileId) {
    if (!canEdit || !client?.id || !fileId) return;

    try {
      await deleteClientFile(client.id, fileId);
      setFiles((current) => current.filter((file) => file.id !== fileId));
      showToast('Arquivo removido.', { variant: 'success' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível remover o arquivo.', { variant: 'error' });
    }
  }

  function handlePaste(event) {
    const pasted = Array.from(event.clipboardData?.files || []);
    if (pasted.length > 0) {
      event.preventDefault();
      handleFiles(pasted);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    handleFiles(event.dataTransfer?.files || []);
  }

  return (
    <section className={styles.panel} onPaste={handlePaste} aria-label="Arquivos do cliente">
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>Drive</span>
          <h3>Arquivos do cliente</h3>
        </div>

        {canEdit ? (
          <button type="button" className={styles.primaryAction} onClick={() => inputRef.current?.click()} disabled={uploading}>
            <PlusIcon size={14} />
            {uploading ? 'Anexando' : 'Anexar arquivo'}
          </button>
        ) : null}
      </header>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => handleFiles(event.target.files)}
      />

      {canEdit ? (
        <div
          className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ''}`.trim()}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
          }}
        >
          <strong>Arraste arquivos, cole com Ctrl+V ou use o botão de upload.</strong>
          <span>Limite por arquivo: 100 MB.</span>
        </div>
      ) : null}

      <div className={styles.fileList}>
        {loading ? <div className={styles.empty}>Carregando arquivos...</div> : null}
        {!loading && files.length === 0 ? <div className={styles.empty}>Nenhum arquivo anexado.</div> : null}

        {!loading && files.map((file) => (
          <article key={file.id} className={styles.fileItem}>
            <div className={styles.fileInfo}>
              <strong>{file.fileName || 'Arquivo'}</strong>
              <span>{formatBytes(file.sizeBytes)} · {formatDate(file.createdAt)}{file.createdByName ? ` · ${file.createdByName}` : ''}</span>
            </div>

            <div className={styles.fileActions}>
              {file.dataUrl ? (
                <a href={file.dataUrl} download={file.fileName || 'arquivo'} aria-label="Baixar arquivo">
                  Baixar
                </a>
              ) : null}

              {canEdit ? (
                <button type="button" onClick={() => handleRemove(file.id)} aria-label="Remover arquivo">
                  <TrashIcon size={14} />
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
