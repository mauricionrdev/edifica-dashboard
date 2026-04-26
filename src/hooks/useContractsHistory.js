import { useEffect, useMemo, useRef, useState } from 'react';
import { listClientMetrics } from '../api/metrics.js';
import { ApiError } from '../api/client.js';

function monthPrefix(year, month0) {
  return `${String(year).padStart(4, '0')}-${String(month0 + 1).padStart(2, '0')}`;
}

function safeMetricData(metric) {
  return metric?.data && typeof metric.data === 'object' ? metric.data : {};
}

export function useContractsHistory(clients, year, month0, months = 2) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const genRef = useRef(0);

  const clientList = useMemo(
    () => (Array.isArray(clients) ? clients.filter((c) => c?.id) : []),
    [clients]
  );

  const idsKey = useMemo(
    () => clientList.map((c) => c.id).sort().join('|'),
    [clientList]
  );

  useEffect(() => {
    if (clientList.length === 0) {
      setRows([]);
      return;
    }

    const gen = ++genRef.current;
    setLoading(true);
    setError(null);

    const safeMonths = Math.min(Math.max(Number(months) || 2, 1), 2);
    const targets = [];
    for (let i = safeMonths - 1; i >= 0; i -= 1) {
      let targetYear = year;
      let targetMonth = month0 - i;
      while (targetMonth < 0) {
        targetMonth += 12;
        targetYear -= 1;
      }
      targets.push({ y: targetYear, m: targetMonth, prefix: monthPrefix(targetYear, targetMonth) });
    }

    Promise.all(clientList.map((client) => listClientMetrics(client.id)))
      .then((responses) => {
        if (genRef.current !== gen) return;

        const aggregate = new Map();
        for (const target of targets) {
          aggregate.set(target.prefix, {
            y: target.y,
            m: target.m,
            label: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(target.y, target.m, 1)).replace('.', ''),
            monthPrefix: target.prefix,
            fechados: 0,
            meta: 0,
            anterior: 0,
          });
        }

        responses.forEach((response, index) => {
          const client = clientList[index];
          const monthlyFallback = Number(client?.metaLucro) || 0;
          const metrics = Array.isArray(response?.metrics) ? response.metrics : [];

          targets.forEach((target) => {
            const bucket = aggregate.get(target.prefix);
            if (!bucket) return;

            const monthMetrics = metrics.filter((metric) => String(metric?.periodKey || '').startsWith(`${target.prefix}-S`));
            if (monthMetrics.length === 0) return;

            let monthClosed = 0;
            let monthGoal = 0;
            monthMetrics.forEach((metric) => {
              const data = safeMetricData(metric);
              monthClosed += Number(data.fechados) || 0;
              monthGoal += Number(data.metaSemanal) || Number(data.metaLucro) || 0;
            });

            if (monthGoal === 0 && monthlyFallback > 0 && target.y === year && target.m === month0) {
              monthGoal = monthlyFallback;
            }

            bucket.fechados += monthClosed;
            bucket.meta += monthGoal;

            const prevPrefix = `${String(target.y - 1).padStart(4, '0')}-${String(target.m + 1).padStart(2, '0')}`;
            const prevMetrics = metrics.filter((metric) => String(metric?.periodKey || '').startsWith(`${prevPrefix}-S`));
            bucket.anterior += prevMetrics.reduce((sum, metric) => sum + (Number(safeMetricData(metric).fechados) || 0), 0);
          });
        });

        setRows(targets.map((target) => aggregate.get(target.prefix)));
      })
      .catch((err) => {
        if (genRef.current !== gen) return;
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err : new Error('Falha ao carregar histórico de métricas.'));
      })
      .finally(() => {
        if (genRef.current === gen) setLoading(false);
      });
  }, [clientList, idsKey, year, month0, months]);

  return { loading, error, rows };
}
