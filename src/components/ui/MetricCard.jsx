// ================================================================
//  MetricCard — componente compartilhado (design system unificado)
//
//  Usado em CentralPage e GdvPage para garantir consistência visual:
//  mesma altura, mesma tipografia, mesma gauge bar, mesmos tokens
//  de cor de status.
//
//  Props:
//    label       string       — rótulo superior (pequeno, uppercase)
//    value       string|num   — valor principal (grande, destaque)
//    sub         node         — texto de apoio opcional
//    pill        node         — badge/pill opcional no topo direito
//    pct         number|null  — percentual para gauge bar (0–100+)
//                               null = não exibe gauge
//    tone        'auto'|'green'|'amber'|'red'|'neutral'
//                             — cor da gauge. 'auto' deriva de pct:
//                               >=90 green, >=50 amber, <50 red
//    onClick     fn           — torna o card clicável (cursor pointer)
//    className   string       — classes extras opcionais
// ================================================================

import styles from './MetricCard.module.css';

function resolveTone(tone, pct) {
  if (tone && tone !== 'auto') return tone;
  if (pct == null) return 'neutral';
  if (pct >= 90) return 'green';
  if (pct >= 50) return 'amber';
  return 'red';
}

export default function MetricCard({
  label,
  value,
  sub,
  pill,
  pct = null,
  tone = 'auto',
  onClick,
  className = '',
}) {
  const resolved = resolveTone(tone, pct);
  const hasGauge = pct != null;

  const toneClass = {
    green:   styles.gaugeGreen,
    amber:   styles.gaugeAmber,
    red:     styles.gaugeRed,
    neutral: styles.gaugeNeutral,
  }[resolved] ?? styles.gaugeNeutral;

  return (
    <article
      className={`${styles.card} ${onClick ? styles.clickable : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick(e) : undefined}
    >
      {/* Topline: rótulo + pill opcional */}
      <div className={styles.topline}>
        <span className={styles.label}>{label}</span>
        {pill && <span className={styles.pill}>{pill}</span>}
      </div>

      {/* Valor principal */}
      <strong className={styles.value}>{value}</strong>

      {/* Sub-texto */}
      {sub != null && <span className={styles.sub}>{sub}</span>}

      {/* Gauge bar + percentual */}
      {hasGauge && (
        <div className={styles.gaugeWrap}>
          <div className={styles.gaugeTrack} aria-hidden="true">
            <span
              className={`${styles.gaugeBar} ${toneClass}`}
              style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
            />
          </div>
          <span className={`${styles.gaugePct} ${toneClass}`}>
            {Math.round(Math.min(pct, 999))}%
          </span>
        </div>
      )}
    </article>
  );
}
