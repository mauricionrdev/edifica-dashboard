import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import styles from './SupportTechnologyPage.module.css';

const CODE_LINES = [
  'const atendimento = sincronizarFila(clientesAtivos);',
  'await monitorarConexao({ canal: whatsapp, status: online });',
  'if (alerta.critico) acionarSuporte(responsavel);',
  'fila.processar((lead) => distribuirPorPrioridade(lead));',
  'registrarEvento("suporte_tecnologia", tempoResposta);',
  'cache.invalidar(chave).then(atualizarPainel);',
  'socket.emit("operacao:atualizada", payloadSeguro);',
  'const metricas = calcularSaudeDaOperacao(snapshot);',
  'auditarPermissoes(usuario, recurso, acao);',
  'deploy.validarBuild().publicarQuandoEstavel();',
];

const STREAM_COLUMNS = Array.from({ length: 18 }, (_, index) => index + 1);
const STATUS_POINTS = Array.from({ length: 14 }, (_, index) => index + 1);
const CONSOLE_ROWS = Array.from({ length: 9 }, (_, index) => index + 1);

export default function SupportTechnologyPage() {
  const { setPanelHeader } = useOutletContext();

  useEffect(() => {
    setPanelHeader?.({ title: 'Suporte de tecnologia', description: null, actions: null });
  }, [setPanelHeader]);

  return (
    <main className={styles.page} aria-label="Suporte de tecnologia">
      <section className={styles.devStage} aria-label="Área em construção">
        <div className={styles.ambientGlow} aria-hidden="true" />
        <div className={styles.scanlines} aria-hidden="true" />
        <div className={styles.codeRain} aria-hidden="true">
          {STREAM_COLUMNS.map((column) => (
            <span key={`fluxo-${column}`} style={{ '--i': column }}>
              01&nbsp;fn&nbsp;api&nbsp;db&nbsp;sync&nbsp;log&nbsp;req&nbsp;200&nbsp;ctx&nbsp;ui&nbsp;dev
            </span>
          ))}
        </div>

        <div className={styles.statusField} aria-hidden="true">
          {STATUS_POINTS.map((point) => <span key={`ponto-${point}`} />)}
        </div>

        <div className={styles.editorShell}>
          <div className={styles.editorTopbar} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <div className={styles.editorGrid} aria-hidden="true">
            {CONSOLE_ROWS.map((row) => <span key={`linha-console-${row}`} />)}
          </div>

          <div className={styles.codePanel} aria-hidden="true">
            {CODE_LINES.map((line, index) => (
              <div
                className={styles.codeLine}
                key={line}
                style={{ '--delay': `${index * 0.42}s`, '--chars': line.length }}
              >
                <span className={styles.lineNumber}>{String(index + 1).padStart(2, '0')}</span>
                <span className={styles.typedText}>{line}</span>
              </div>
            ))}
          </div>

          <div className={styles.terminalPanel} aria-hidden="true">
            <span>iniciando módulos internos</span>
            <span>validando integrações</span>
            <span>preparando monitoramento</span>
            <span>aguardando próxima versão</span>
          </div>

          <div className={styles.centerNotice}>
            <span className={styles.kicker}>Suporte de tecnologia</span>
            <h1>Em construção</h1>
          </div>
        </div>
      </section>
    </main>
  );
}
