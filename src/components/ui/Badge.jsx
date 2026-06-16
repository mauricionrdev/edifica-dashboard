import styles from './Badge.module.css';

/**
 * Badge — chip discreto pra sinalização de status, propriedade ou categoria.
 *
 * Substitui toda implementação de badge espalhada por ProfilePage,
 * ClientsPage, PreencherSemanaPage. Consome só tokens globais.
 *
 * Variantes mapeiam para o briefing operacional da Edifica:
 *   success  → Ativo, Concluída, Resolvido
 *   info     → Onboard, Acompanhando, Em andamento, Briefing-informativo
 *   warning  → Vencendo, Briefing, Alta prioridade
 *   danger   → Vencido, Churn, Crítica
 *   brand    → Cargo do usuário (Suporte de tecnologia, CAP, GDV)
 *   neutral  → Pausado, Aberto, Normal
 *
 * Props:
 *   variant   Uma das 6 variantes acima. Default: 'neutral'.
 *   dot       Boolean. Mostra dot colorido à esquerda. Default: true.
 *   children  Texto do badge.
 *   suffix    Texto secundário à direita, separado por divisor vertical
 *             (ex: percentual "100%" depois de "Concluída").
 *   className Adicional, para casos pontuais. Use com cautela.
 *
 * Uso:
 *   <Badge variant="success">Ativo</Badge>
 *   <Badge variant="success" suffix="100%">Concluída</Badge>
 *   <Badge variant="brand" dot={false}>Suporte de tecnologia (TI)</Badge>
 *   <Badge variant="info">Onboard</Badge>
 */
export default function Badge({
  variant = 'neutral',
  dot = true,
  suffix,
  className,
  children,
  ...rest
}) {
  const variantClass = styles[`variant_${variant}`] ?? styles.variant_neutral;
  const classes = [styles.badge, variantClass, className].filter(Boolean).join(' ');

  return (
    <span className={classes} {...rest}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      <span className={styles.label}>{children}</span>
      {suffix && (
        <>
          <span className={styles.divider} aria-hidden="true" />
          <span className={styles.suffix}>{suffix}</span>
        </>
      )}
    </span>
  );
}
