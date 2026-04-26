// ================================================================
//  ContractsChart
//
//  [Fase 4] Reescrito para seguir o design de referência:
//    - Curvas suaves (Bézier cúbicas) em vez de linhas retas
//    - Auto-scale inteligente do eixo Y (evita linha achatada no
//      topo quando todos os valores são iguais ou baixos)
//    - Tooltips "badge com seta" por série (laranja/verde/azul)
//    - Pontos com halo + anel, estilo referência
//    - Áreas com gradiente mais leve
//
//  Séries:
//    - Fechados (laranja #FFAE4C) — primária
//    - Meta (verde #6FD195) — referência
//    - Ano anterior (azul #7086FD) — comparativo
// ================================================================

import { useMemo, useState, useRef } from 'react';
import { fmtInt } from '../../utils/format.js';
import styles from './ContractsChart.module.css';

const CHART_W = 1095;
const CHART_H = 360;
const GRID = { top: 7, right: 2, bottom: 45, left: 37 };
const PAD = { top: 7, right: 28, bottom: 45, left: 70 };
const DATA_BASELINE_GAP = 10;

// --------------------------------------------------------------
//  Auto-scale inteligente
//  Resolve o bug de linha achatada no topo quando todos os valores
//  são iguais. Sempre dá 20% de folga acima do maior valor.
// --------------------------------------------------------------
function niceMax(value) {
  if (value <= 0) return 10;
  const padded = value * 1.2;
  if (padded <= 5)   return 5;
  if (padded <= 10)  return 10;
  if (padded <= 20)  return 20;
  if (padded <= 40)  return 40;
  if (padded <= 60)  return 60;
  if (padded <= 80)  return 80;
  if (padded <= 100) return 100;
  if (padded <= 200) return Math.ceil(padded / 20) * 20;
  if (padded <= 500) return Math.ceil(padded / 50) * 50;
  return Math.ceil(padded / 100) * 100;
}

// --------------------------------------------------------------
//  Curva suave Catmull-Rom → Bézier cúbica
//  Usado para quando há 3+ pontos. Tension baixo = mais suave.
// --------------------------------------------------------------
function smoothPath(points, tension = 0.22) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;

  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function smoothAreaPath(points, baselineY, tension = 0.22) {
  if (!points || points.length === 0) return '';
  const line = smoothPath(points, tension);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L${last.x} ${baselineY} L${first.x} ${baselineY} Z`;
}

function buildLine(points) {
  if (!points.length) return '';
  return points
    .map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`))
    .join(' ');
}

function buildArea(points, baselineY) {
  if (!points.length) return '';
  const line = buildLine(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L${last.x} ${baselineY} L${first.x} ${baselineY} Z`;
}

export default function ContractsChart({ rows, minMax = 0 }) {
  const rows_ = Array.isArray(rows) && rows.length > 0 ? rows : [];
  const hasData = rows_.length > 0;

  // Detecta se alguma série tem valor > 0
  const hasAnyValue = useMemo(() => {
    if (!hasData) return false;
    for (const r of rows_) {
      if ((r.fechados || 0) > 0 || (r.meta || 0) > 0 || (r.anterior || 0) > 0) {
        return true;
      }
    }
    return false;
  }, [rows_, hasData]);

  const maxVal = useMemo(() => {
    if (!hasData) return 10;
    let m = 0;
    for (const r of rows_) {
      m = Math.max(m, r.fechados || 0, r.meta || 0, r.anterior || 0);
    }
    return niceMax(Math.max(m, Number(minMax) || 0));
  }, [hasData, rows_, minMax]);

  const yTicks = useMemo(() => {
    const ticks = [];
    const referenceLabels = maxVal === 100 ? [100, 70, 50, 30, 10, 0] : null;
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const v = referenceLabels ? referenceLabels[i] : Math.round((maxVal / steps) * (steps - i));
      const y = GRID.top + ((CHART_H - GRID.top - GRID.bottom) * i) / steps;
      ticks.push({ v, y });
    }
    return ticks;
  }, [maxVal]);

  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;
  const baselineY = PAD.top + innerH;
  const plotBottomY = baselineY - DATA_BASELINE_GAP;
  const plotH = plotBottomY - PAD.top;
  const gridW = CHART_W - GRID.left - GRID.right;
  const step = rows_.length > 1 ? innerW / (rows_.length - 1) : 0;
  const gridStep = rows_.length > 1 ? gridW / (rows_.length - 1) : 0;

  function toPoints(key) {
    return rows_.map((r, i) => {
      const v = Number(r[key]) || 0;
      const x = PAD.left + step * i;
      const y = plotBottomY - (maxVal > 0 ? (v / maxVal) * plotH : 0);
      return { x, y, v, label: r.label, row: r };
    });
  }

  const ptFechados = useMemo(() => toPoints('fechados'), [rows_, maxVal]);
  const ptMeta     = useMemo(() => toPoints('meta'),     [rows_, maxVal]);
  const ptPrev     = useMemo(() => toPoints('anterior'), [rows_, maxVal]);

  const useCurve = rows_.length >= 3;
  const tension = 0.22;

  const pathFechados = useCurve ? smoothPath(ptFechados, tension) : buildLine(ptFechados);
  const pathMeta     = useCurve ? smoothPath(ptMeta,     tension) : buildLine(ptMeta);
  const pathPrev     = useCurve ? smoothPath(ptPrev,     tension) : buildLine(ptPrev);

  const areaFechados = useCurve ? smoothAreaPath(ptFechados, baselineY, tension) : buildArea(ptFechados, baselineY);
  const areaMeta     = useCurve ? smoothAreaPath(ptMeta,     baselineY, tension) : buildArea(ptMeta,     baselineY);
  const areaPrev     = useCurve ? smoothAreaPath(ptPrev,     baselineY, tension) : buildArea(ptPrev,     baselineY);

  const totals = useMemo(() => {
    return rows_.reduce(
      (acc, r) => ({
        fechados: acc.fechados + (Number(r.fechados) || 0),
        meta:     acc.meta     + (Number(r.meta)     || 0),
        anterior: acc.anterior + (Number(r.anterior) || 0),
      }),
      { fechados: 0, meta: 0, anterior: 0 }
    );
  }, [rows_]);

  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);

  const activeRow = active >= 0 ? rows_[active] : null;
  const activePoints = active >= 0
    ? { fec: ptFechados[active], meta: ptMeta[active], prev: ptPrev[active] }
    : null;

  return (
    <>
      <div
        className={styles.wrap}
        ref={wrapRef}
        onMouseLeave={() => setActive(-1)}
      >
        <svg
          className={styles.svg}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          aria-label="Evolução de contratos fechados"
          role="img"
        >
          {/* Grid Y + labels */}
          {yTicks.map((t, i) => (
            <g key={`y${i}`}>
              <line
                x1={GRID.left}
                x2={CHART_W - GRID.right}
                y1={t.y}
                y2={t.y}
                className={i === yTicks.length - 1 ? styles.axisBase : styles.gridDashed}
              />
              <text
                x={GRID.left - 10}
                y={t.y + 4}
                className={styles.axisLabel}
                textAnchor="end"
              >
                {t.v}
              </text>
            </g>
          ))}

          {/* Grid X */}
          {rows_.map((_, i) => {
            const x = GRID.left + gridStep * i;
            return (
              <line
                key={`vx${i}`}
                x1={x}
                x2={x}
                y1={GRID.top}
                y2={baselineY}
                className={styles.gridDashed}
              />
            );
          })}

          {/* Guide da coluna ativa */}
          {active >= 0 && (
            <line
              x1={PAD.left + step * active}
              x2={PAD.left + step * active}
              y1={GRID.top}
              y2={baselineY}
              className={styles.columnGuide}
            />
          )}

          {/* Áreas */}
          {hasAnyValue && <path d={areaPrev}     className={styles.areaPrev} />}
          {hasAnyValue && <path d={areaMeta}     className={styles.areaMeta} />}
          {hasAnyValue && <path d={areaFechados} className={styles.areaPrimary} />}

          {/* Linhas */}
          {hasAnyValue && <path d={pathPrev}     className={styles.linePrev} />}
          {hasAnyValue && <path d={pathMeta}     className={styles.lineMeta} />}
          {hasAnyValue && <path d={pathFechados} className={styles.linePrimary} />}

          {/* Pontos */}
          {hasAnyValue && renderPoints(ptPrev,     '#7086FD', active)}
          {hasAnyValue && renderPoints(ptMeta,     '#6FD195', active)}
          {hasAnyValue && renderPoints(ptFechados, '#FFAE4C', active)}

          {/* Labels X */}
          {rows_.map((r, i) => {
            const x = PAD.left + step * i;
            return (
              <text
                key={`xl${i}`}
                x={x}
                y={baselineY + 21}
                className={styles.xLabel}
              >
                {r.label}
              </text>
            );
          })}

          {/* Tooltips badge */}
          {activePoints && activeRow && renderTooltipBadges(activePoints, activeRow, CHART_W)}

          {/* Hit areas */}
          {rows_.map((_, i) => {
            const x = PAD.left + step * i;
            const halfStep = step > 0 ? step / 2 : innerW / 2;
            return (
              <rect
                key={`hit${i}`}
                x={x - halfStep}
                y={GRID.top}
                width={step > 0 ? step : innerW}
                height={baselineY - GRID.top}
                className={styles.columnHit}
                onMouseEnter={() => setActive(i)}
              />
            );
          })}
        </svg>

        {!hasAnyValue && hasData && (
          <div className={styles.emptyOverlay}>
            Sem movimentação nos últimos meses · preencha a semana para ver evolução
          </div>
        )}

        {!hasData && (
          <div className={styles.emptyOverlay}>
            Sem histórico de métricas preenchidas ainda
          </div>
        )}
      </div>

      {/* Legenda */}
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.legendLine} ${styles.legendLinePrimary}`} />
          Fechados
          <span className={styles.legendValue}>{fmtInt(totals.fechados) || '0'}</span>
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.legendLine} ${styles.legendLineMeta}`} />
          Meta
          <span className={styles.legendValue}>{fmtInt(totals.meta) || '0'}</span>
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.legendLine} ${styles.legendLinePrev}`} />
          Ano anterior
          <span className={styles.legendValue}>{fmtInt(totals.anterior) || '0'}</span>
        </span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------

function renderPoints(points, color, activeIdx) {
  return points.map((p, i) => {
    const isActive = i === activeIdx;
    return (
      <g key={`pt-${color}-${i}`}>
        <circle
          cx={p.x}
          cy={p.y}
          r={isActive ? 10.5 : 9.94}
          fill={color}
          opacity={isActive ? 0.3 : 0.25}
        />
        <circle
          cx={p.x}
          cy={p.y}
          r={isActive ? 4.6 : 4.35}
          fill={color}
          stroke="#ffffff"
          strokeWidth={1.24286}
        />
      </g>
    );
  });
}

/**
 * Renderiza 3 badges (Fechados/Meta/Ano anterior) estilo referência:
 * retângulo com fill translúcido + borda + seta apontando para o ponto.
 * Posição X é centrada no ponto mas clampada para não sair do chart.
 * Distribui verticalmente quando os pontos ficam muito próximos.
 */
function renderTooltipBadges(pts, row, chartW) {
  const BADGE_H = 22.5;
  const ARROW_H = 3.75;
  const ARROW_W = 4.33;
  const GAP = 11.3;

  // Separa séries com valor > 0 (evita badge "0 contratos" poluindo)
  const allSeries = [
    { pt: pts.fec,  value: row.fechados, color: '#FFAE4C', key: 'fec' },
    { pt: pts.meta, value: row.meta,     color: '#6FD195', key: 'meta' },
    { pt: pts.prev, value: row.anterior, color: '#7086FD', key: 'prev' },
  ].filter((s) => s.pt && (Number(s.value) || 0) > 0);

  if (allSeries.length === 0) return null;

  // Ordena por Y ascendente (ponto mais alto = badge mais em cima)
  const sorted = [...allSeries].sort((a, b) => a.pt.y - b.pt.y);

  // Empilha verticalmente quando os pontos estão próximos no eixo Y
  const MIN_VERTICAL_GAP = BADGE_H + 6;
  const slots = [];
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const naturalBadgeY = s.pt.y - GAP - ARROW_H - BADGE_H;
    let badgeY = naturalBadgeY;
    if (i > 0 && slots[i - 1].badgeY + MIN_VERTICAL_GAP > badgeY) {
      badgeY = slots[i - 1].badgeY - MIN_VERTICAL_GAP;
    }
    slots.push({ ...s, badgeY });
  }

  return (
    <g style={{ pointerEvents: 'none' }}>
      {slots.map((s) => {
        const text = `${fmtInt(s.value) || 0} Contratos`;
        const BADGE_W = Math.max(69.5, Math.min(86, text.length * 5.7 + 12));
        let badgeX = s.pt.x - BADGE_W / 2;
        if (badgeX < 8) badgeX = 8;
        if (badgeX + BADGE_W > chartW - 8) badgeX = chartW - BADGE_W - 8;

        const arrowTipY  = s.pt.y - GAP;
        const arrowBaseY = arrowTipY - ARROW_H;
        const arrowCx    = s.pt.x;

        return (
          <g key={s.key}>
            <rect
              x={badgeX}
              y={s.badgeY}
              width={BADGE_W}
              height={BADGE_H}
              rx={1.75}
              ry={1.75}
              fill={s.color}
              fillOpacity={0.3}
              stroke={s.color}
              strokeWidth={0.5}
            />
            <text
              x={badgeX + BADGE_W / 2}
              y={s.badgeY + BADGE_H / 2 + 4}
              textAnchor="middle"
              fill="#ffffff"
              fontFamily="'Manrope', system-ui, sans-serif"
              fontSize={10}
              fontWeight={700}
            >
              {text}
            </text>
            <path
              d={`M${arrowCx - ARROW_W / 2} ${arrowBaseY} L${arrowCx + ARROW_W / 2} ${arrowBaseY} L${arrowCx} ${arrowTipY} Z`}
              fill={s.color}
              stroke={s.color}
              strokeWidth={0.5}
            />
          </g>
        );
      })}
    </g>
  );
}
