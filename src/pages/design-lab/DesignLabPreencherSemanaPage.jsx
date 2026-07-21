import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import { createMetricCampaign, deleteMetricCampaign, getContractsSummary, getMetric, listMetricCampaigns, upsertMetric } from '../../api/metrics.js';
import { ApiError } from '../../api/client.js';
import { ChartColumnIcon, PlusIcon, SearchIcon, Select, TargetIcon, TrashIcon, UsersIcon } from '../../components/ui/index.js';
import StateBlock from '../../components/ui/StateBlock.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { canFillMetrics } from '../../utils/permissions.js';
import { MONTHS_FULL, fmtDec, fmtInt, fmtMoney, fmtPct } from '../../utils/format.js';
import { buildPeriodKey, calcWeek, currentWeek } from '../../utils/gdvMetrics.js';
import { parseLocaleNumber } from '../../utils/number.js';
import { matchesAnySearch } from '../../utils/search.js';
import { isActiveClientStatus } from '../../utils/clientStatus.js';
import { clientInitials } from '../../utils/clientHelpers.js';
import { getClientAvatar, getSquadAvatar, subscribeAvatarChange } from '../../utils/avatarStorage.js';
import styles from './DesignLabPreencherSemanaPage.module.css';
import ClientName, { isPremiumClient } from '../../components/clients/ClientName.jsx';

const EMPTY_DATA = {
  metaSemanal: '',
  fechados: '',
  investimento: '',
  cpl: '',
  volume: '',
  metaEmpate: '',
  metaVolume: '',
  metaCpl: '',
  observacoes: '',
};

const FIXED_MONTH_FIELDS = ['investimento', 'metaCpl', 'metaVolume', 'metaEmpate', 'metaSemanal'];
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];
function normalizeCampaigns(campaigns) {
  return (Array.isArray(campaigns) ? campaigns : [])
    .filter((campaign) => campaign && campaign.id)
    .map((campaign, index) => ({
      id: String(campaign.id),
      name: String(campaign.name || `Campanha ${index + 2}`).trim() || `Campanha ${index + 2}`,
      createdAt: campaign.createdAt || new Date().toISOString(),
      metricPeriodKey: campaign.metricPeriodKey || campaign.periodKey || '',
    }));
}

function campaignMetricPeriodKey(periodKey, campaign) {
  if (campaign && typeof campaign === 'object') {
    return campaign.metricPeriodKey || campaign.periodKey || `${periodKey}__campaign:${campaign.id}`;
  }
  const id = String(campaign || '').trim();
  return id ? `${periodKey}__campaign:${id}` : periodKey;
}

function splitCampaignPeriodKey(periodKey) {
  const [base, campaignSuffix = ''] = String(periodKey || '').split('__campaign:');
  return { base, campaignSuffix: campaignSuffix ? `__campaign:${campaignSuffix}` : '' };
}

const TRAFFIC_FIELDS = [
  { key: 'cpl', label: 'CPL atual (R$)', kind: 'weekly', placeholder: '0,00' },
  { key: 'volume', label: 'Volume de leads', kind: 'weekly', placeholder: '0' },
  { key: 'investimento', label: 'Investimento (R$)', kind: 'once', placeholder: '0,00' },
  { key: 'metaCpl', label: 'Meta CPL (R$)', kind: 'once', placeholder: 'meta' },
  { key: 'metaVolume', label: 'Meta volume', kind: 'once', placeholder: 'meta' },
  { key: 'leadsPrevistos', label: 'Leads previstos (auto)', kind: 'auto', computed: true },
];

const COMMERCIAL_FIELDS = [
  { key: 'fechados', label: 'Contratos fechados', kind: 'weekly', placeholder: '0' },
  { key: 'metaEmpate', label: 'Meta empate (qtd)', kind: 'once', placeholder: 'empate' },
  { key: 'metaSemanal', label: 'Meta lucro (qtd)', kind: 'once', placeholder: 'lucro' },
  { key: 'taxa', label: 'Taxa conversão (auto)', kind: 'auto', computed: true },
  { key: 'contratosPrevistos', label: 'Contratos prev. (auto)', kind: 'auto', computed: true },
];

function dataFromMetric(metric) {
  const data = metric?.data || {};
  return {
    metaSemanal: data.metaSemanal == null ? '' : String(data.metaSemanal),
    fechados: data.fechados == null ? '' : String(data.fechados),
    investimento: data.investimento == null ? '' : String(data.investimento),
    cpl: data.cpl == null ? '' : String(data.cpl),
    volume: data.volume == null ? '' : String(data.volume),
    metaEmpate: data.metaEmpate == null ? '' : String(data.metaEmpate),
    metaVolume: data.metaVolume == null ? '' : String(data.metaVolume),
    metaCpl: data.metaCpl == null ? '' : String(data.metaCpl),
    observacoes: data.observacoes || '',
  };
}

function sanitizeForSave(form) {
  const payload = {};
  Object.entries(form).forEach(([key, raw]) => {
    if (key === 'observacoes') {
      payload.observacoes = String(raw || '').trim();
      return;
    }
    if (raw === '' || raw == null) {
      if (Object.prototype.hasOwnProperty.call(EMPTY_DATA, key)) payload[key] = null;
      return;
    }
    const numeric = parseLocaleNumber(raw);
    if (!Number.isNaN(numeric) && numeric >= 0) payload[key] = numeric;
  });
  return payload;
}

function pickFields(source = {}, keys = []) {
  const picked = {};
  keys.forEach((key) => {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      picked[key] = source[key];
    }
  });
  return picked;
}

function hasAnyField(source = {}, keys = []) {
  return keys.some((key) => source[key] !== undefined && source[key] !== null && source[key] !== '');
}

function changedFields(next = {}, previous = {}, keys = []) {
  return keys.filter((key) => String(next[key] ?? '') !== String(previous[key] ?? ''));
}

function sameMonthPeriodKey(periodKey, targetWeek) {
  const { base, campaignSuffix } = splitCampaignPeriodKey(periodKey);
  const prefix = String(base || '').replace(/-S[1-4]$/, '');
  return `${prefix}-S${targetWeek}${campaignSuffix}`;
}

function previousMonthWeek4PeriodKey(periodKey) {
  const { base, campaignSuffix } = splitCampaignPeriodKey(periodKey);
  const match = /^(\d{4})-(\d{2})-S[1-4]$/.exec(String(base || ''));
  if (!match) return '';

  let year = Number(match[1]);
  let month = Number(match[2]) - 1;

  if (month === 0) {
    month = 12;
    year -= 1;
  }

  return `${year}-${String(month).padStart(2, '0')}-S4${campaignSuffix}`;
}

function weekReferenceDate(year, month0, week) {
  const safeWeek = Math.min(Math.max(Number(week) || 1, 1), 4);
  const day = [1, 8, 15, 22][safeWeek - 1];
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function mergeMissingFixedFields(currentForm = {}, candidate = {}) {
  const inherited = {};

  FIXED_MONTH_FIELDS.forEach((key) => {
    if (String(currentForm[key] || '').trim() === '' && String(candidate[key] || '').trim() !== '') {
      inherited[key] = candidate[key];
    }
  });

  return {
    form: Object.keys(inherited).length ? { ...currentForm, ...inherited } : currentForm,
    inherited,
  };
}

async function resolveFixedMonthFields(clientId, periodKey, currentWeek, currentForm) {
  const currentHasAllFixed = FIXED_MONTH_FIELDS.every((key) => String(currentForm[key] || '').trim() !== '');
  if (currentHasAllFixed) {
    return { form: currentForm, inherited: {}, source: 'current' };
  }

  const weekOrder = [currentWeek - 1, currentWeek - 2, currentWeek - 3, currentWeek + 1, currentWeek + 2, currentWeek + 3]
    .filter((value) => value >= 1 && value <= 4);

  for (const targetWeek of weekOrder) {
    try {
      const res = await getMetric(clientId, sameMonthPeriodKey(periodKey, targetWeek));
      const candidate = dataFromMetric(res?.metric);
      if (hasAnyField(candidate, FIXED_MONTH_FIELDS)) {
        const merged = mergeMissingFixedFields(currentForm, candidate);
        return { ...merged, source: 'same-month' };
      }
    } catch {
      // Se uma semana não carregar, mantém a tela usando os dados da semana atual.
    }
  }

  const previousMonthWeek4 = previousMonthWeek4PeriodKey(periodKey);
  if (previousMonthWeek4) {
    try {
      const res = await getMetric(clientId, previousMonthWeek4);
      const candidate = dataFromMetric(res?.metric);
      if (hasAnyField(candidate, FIXED_MONTH_FIELDS)) {
        const merged = mergeMissingFixedFields(currentForm, candidate);
        return { ...merged, source: 'previous-month-week-4' };
      }
    } catch {
      // Se o mês anterior não tiver dados, segue sem herança.
    }
  }

  return { form: currentForm, inherited: {}, source: 'none' };
}

function filteredClientsForSelect(clients, squadFilter) {
  const list = Array.isArray(clients) ? clients.filter((client) => client && isActiveClientStatus(client.status)) : [];
  const filtered = squadFilter
    ? list.filter((client) => (client.squadId || client.squad_id) === squadFilter)
    : list;

  return [...filtered].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
}

function StatusChip({ status }) {
  if (status === 'saving') {
    return <span className={`${styles.statusChip} ${styles.statusSaving}`}>Salvando...</span>;
  }
  if (status === 'saved') {
    return <span className={`${styles.statusChip} ${styles.statusSaved}`}>Salvo</span>;
  }
  if (status === 'error') {
    return <span className={`${styles.statusChip} ${styles.statusError}`}>Erro</span>;
  }
  return null;
}


function fieldValue(form, localCalc, key) {
  if (key === 'leadsPrevistos') return localCalc.lp > 0 ? fmtInt(Math.round(localCalc.lp)) : '—';
  if (key === 'taxa') return localCalc.taxa > 0 ? fmtPct(localCalc.taxa) : '—';
  if (key === 'contratosPrevistos') return localCalc.cp > 0 ? fmtInt(Math.round(localCalc.cp)) : '—';

  const raw = form[key] ?? '';
  return raw === '' ? '' : raw;
}

function buildCardSummary({ loaded, monthlyGoal, monthlyClosed, weeklyGoal, fechados, localCalc, form }) {
  const hasManualData = ['cpl', 'volume', 'investimento', 'fechados', 'metaSemanal', 'metaEmpate', 'metaVolume', 'metaCpl']
    .some((key) => String(form[key] || '').trim() !== '');
  const monthGoalValue = Number(monthlyGoal) || 0;
  const monthClosedValue = Number(monthlyClosed) || 0;
  const weekGoalValue = Number(weeklyGoal) || 0;

  if (!loaded) {
    return { tone: 'neutral', label: 'Carregando' };
  }

  if (!hasManualData && localCalc.cp <= 0 && localCalc.lp <= 0) {
    return { tone: 'neutral', label: 'Sem dados' };
  }

  if (monthGoalValue <= 0 && weekGoalValue <= 0) {
    return { tone: 'warning', label: 'Sem meta' };
  }

  if (monthGoalValue > 0 && monthClosedValue >= monthGoalValue) {
    return { tone: 'good', label: 'Meta batida' };
  }

  if (weekGoalValue > 0 && fechados >= weekGoalValue) {
    return { tone: 'good', label: 'Semana batida' };
  }

  if (weekGoalValue > 0 && localCalc.cp >= weekGoalValue) {
    return { tone: 'good', label: 'Semana no ritmo' };
  }

  if (fechados > 0 || localCalc.cp > 0 || localCalc.lp > 0) {
    return { tone: 'warning', label: 'Em andamento' };
  }

  return { tone: 'risk', label: 'Em risco' };
}

function MetricField({
  client,
  field,
  value,
  canEdit,
  onChange,
  onBlur,
}) {
  const isComputed = field.computed;
  const rootClass = [styles.fieldCard, styles[`fieldCard_${field.kind}`]].join(' ');

  return (
    <div className={rootClass}>
      <div className={styles.fieldHeader}>
        <span>{field.label}</span>
      </div>

      {isComputed ? (
        <div className={`${styles.fieldValue} ${styles.fieldValue_readonly}`}>{value || '—'}</div>
      ) : (
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(field.key, event.target.value)}
          onBlur={() => onBlur()}
          className={styles.fieldInput}
          placeholder={field.placeholder}
          disabled={!canEdit}
          aria-label={`${field.label} de ${client.name}`}
        />
      )}
    </div>
  );
}

function SegmentBlock({ title, shortLabel, fields, client, form, localCalc, canEdit, setField, handleBlur }) {
  const SegmentIcon = title === 'Tráfego' ? ChartColumnIcon : TargetIcon;

  return (
    <section className={styles.segmentBlock}>
      <header className={styles.segmentHeader}>
        <span className={styles.segmentIcon} aria-hidden="true">
          <SegmentIcon size={14} strokeWidth={2.2} />
        </span>
        <strong>{title}</strong>
      </header>

      <div className={styles.segmentGrid}>
        {fields.map((field) => (
          <MetricField
            key={field.key}
            client={client}
            field={field}
            value={fieldValue(form, localCalc, field.key)}
            canEdit={canEdit && !field.computed}
            onChange={setField}
            onBlur={handleBlur}
          />
        ))}
      </div>
    </section>
  );
}

function WeekCardBase({ client, periodKey, week, campaignLabel = '', campaignCount = 0, monthlySummary = null, canEdit, onSaved, onRequestCampaign, onRequestCampaigns, onLoadError = null }) {
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('idle');
  const [serverComputed, setServerComputed] = useState({});
  const [avatarVersion, setAvatarVersion] = useState(0);
  const loadGenRef = useRef(0);
  const saveTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const latestFormRef = useRef(EMPTY_DATA);
  const lastSavedRef = useRef('{}');

  const runSave = useCallback(
    async (nextForm, immediate = false) => {
      const payload = sanitizeForSave(nextForm);
      const serialized = JSON.stringify(payload);
      if (serialized === lastSavedRef.current) {
        if (mountedRef.current && !immediate) setStatus('idle');
        return;
      }

      const previousPayload = JSON.parse(lastSavedRef.current || '{}');
      const fixedFieldsChanged = changedFields(payload, previousPayload, FIXED_MONTH_FIELDS);
      const fixedPayload = pickFields(payload, fixedFieldsChanged);

      if (mountedRef.current) setStatus('saving');
      try {
        const res = await upsertMetric(client.id, periodKey, payload);

        if (fixedFieldsChanged.length > 0) {
          const targetWeeks = [1, 2, 3, 4].filter((targetWeek) => targetWeek >= week && targetWeek !== week);
          await Promise.all(
            targetWeeks.map((targetWeek) => upsertMetric(client.id, sameMonthPeriodKey(periodKey, targetWeek), fixedPayload))
          );
        }

        lastSavedRef.current = serialized;
        if (!mountedRef.current) return;
        setServerComputed(res?.metric?.computed || {});
        setStatus('saved');
        onSaved?.(client.id, res);
        setTimeout(() => {
          if (mountedRef.current) {
            setStatus((current) => (current === 'saved' ? 'idle' : current));
          }
        }, 1200);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 401) && mountedRef.current) {
          showToast(`Erro ao salvar ${client.name}`, 'error');
        }
        if (mountedRef.current) setStatus('error');
      }
    },
    [client.id, client.name, onSaved, periodKey, showToast, week]
  );

  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    return runSave(latestFormRef.current, true);
  }, [runSave]);


  useEffect(() => {
    const unsubscribe = subscribeAvatarChange(() => setAvatarVersion((value) => value + 1));
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const token = ++loadGenRef.current;
    setLoaded(false);

    getMetric(client.id, periodKey)
      .then(async (res) => {
        if (loadGenRef.current !== token) return;
        const currentForm = dataFromMetric(res?.metric);
        const resolvedFixedFields = await resolveFixedMonthFields(client.id, periodKey, week, currentForm);
        const nextForm = resolvedFixedFields.form;
        if (loadGenRef.current !== token) return;

        // Segurança de produção: não gravar métricas automaticamente durante o carregamento.
        // A herança de campos fixos do mês anterior continua preenchendo a UI, mas a
        // persistência só acontece em ação explícita do usuário. Isso evita uma cascata
        // de PUTs/500 ao abrir Preencher Semana na virada do mês.

        latestFormRef.current = nextForm;
        lastSavedRef.current = JSON.stringify(sanitizeForSave(nextForm));
        setForm(nextForm);
        setServerComputed(res?.metric?.computed || {});
        setLoaded(true);
      })
      .catch((err) => {
        if (loadGenRef.current !== token) return;
        if (!(err instanceof ApiError && err.status === 401)) {
          if (typeof onLoadError === 'function') {
            onLoadError(client, err);
          } else {
            showToast(`Erro ao carregar ${client.name}`, 'error');
          }
        }
        latestFormRef.current = EMPTY_DATA;
        lastSavedRef.current = JSON.stringify(sanitizeForSave(EMPTY_DATA));
        setForm(EMPTY_DATA);
        setLoaded(true);
      });

    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        void runSave(latestFormRef.current, true);
      }
    };
  }, [client, client.id, client.name, onLoadError, periodKey, runSave, showToast]);

  const localCalc = useMemo(
    () => calcWeek({ data: sanitizeForSave(form), computed: serverComputed }),
    [form, serverComputed]
  );

  const scheduleSave = useCallback(
    (nextForm) => {
      latestFormRef.current = nextForm;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void runSave(nextForm);
      }, 500);
    },
    [runSave]
  );

  function setField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      scheduleSave(next);
      return next;
    });
  }

  const weeklyGoal = localCalc.mLuc > 0 ? localCalc.mLuc : parseLocaleNumber(form.metaSemanal, 0);
  const fechados = parseLocaleNumber(form.fechados, 0);
  const monthlyGoal = Number(monthlySummary?.monthGoal) || Number(client.metaLucro) || 0;
  const savedMonthClosed = Number(monthlySummary?.monthClosed) || 0;
  const savedWeekClosed = Number(monthlySummary?.weekClosed) || 0;
  const monthlyClosed = (savedMonthClosed > 0 || savedWeekClosed > 0)
    ? Math.max(savedMonthClosed - savedWeekClosed + fechados, 0)
    : fechados;
  const summary = buildCardSummary({ loaded, monthlyGoal, monthlyClosed, weeklyGoal, fechados, localCalc, form });
  const avatarUrl = getClientAvatar(client);
  const ownerLabel = [client.squadName, client.gdvName || client.gestor].filter(Boolean).join(' · ');

  const handleBlur = useCallback(() => {
    void flushPendingSave();
  }, [flushPendingSave]);

  return (
    <article className={styles.clientCard}>
      <div className={styles.clientTopbar}>
        <div className={styles.clientIdentity}>
          <div
            className={styles.clientAvatar}
            data-avatar-version={avatarVersion}
          >
            {avatarUrl ? <img src={avatarUrl} alt="" /> : clientInitials(client.name)}
          </div>

          <div className={styles.clientText}>
            <ClientName as="strong" client={client} />
            <span>{ownerLabel || 'Sem responsável definido'}</span>
          </div>
        </div>

        <div className={styles.clientTopbarRight}>
          {campaignLabel ? <span className={styles.campaignBadge}>{campaignLabel}</span> : null}
          {!campaignLabel && campaignCount > 0 ? (
            <button
              type="button"
              className={styles.campaignsButton}
              onClick={() => onRequestCampaigns?.(client)}
              aria-label={`Ver outras campanhas de ${client.name}`}
              title="Outras campanhas"
            >
              Outras campanhas
              <span>{campaignCount}</span>
            </button>
          ) : null}
          <span className={`${styles.progressPill} ${styles[`progressPill_${summary.tone}`]}`}>{summary.label}</span>
          <StatusChip status={status} />
          {canEdit && !campaignLabel ? (
            <button
              type="button"
              className={styles.addCampaignButton}
              onClick={() => onRequestCampaign?.(client)}
              aria-label={`Adicionar campanha para ${client.name}`}
              title="Adicionar campanha"
            >
              <PlusIcon size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.clientSegments}>
        <SegmentBlock
          title="Tráfego"
          shortLabel="T"
          fields={TRAFFIC_FIELDS}
          client={client}
          form={form}
          localCalc={localCalc}
          canEdit={canEdit}
          setField={setField}
          handleBlur={handleBlur}
        />

        <SegmentBlock
          title="Comercial"
          shortLabel="C"
          fields={COMMERCIAL_FIELDS}
          client={client}
          form={form}
          localCalc={localCalc}
          canEdit={canEdit}
          setField={setField}
          handleBlur={handleBlur}
        />
      </div>
    </article>
  );
}

const WeekCard = memo(WeekCardBase, (prevProps, nextProps) => {
  return (
    prevProps.client === nextProps.client &&
    prevProps.periodKey === nextProps.periodKey &&
    prevProps.week === nextProps.week &&
    prevProps.campaignLabel === nextProps.campaignLabel &&
    prevProps.campaignCount === nextProps.campaignCount &&
    prevProps.monthlySummary === nextProps.monthlySummary &&
    prevProps.canEdit === nextProps.canEdit &&
    prevProps.onSaved === nextProps.onSaved &&
    prevProps.onRequestCampaign === nextProps.onRequestCampaign &&
    prevProps.onRequestCampaigns === nextProps.onRequestCampaigns &&
    prevProps.onLoadError === nextProps.onLoadError
  );
});

export default function DesignLabPreencherSemanaPage() {
  const { clients, squads, loading: shellLoading, setPanelHeader } = useOutletContext();
  const { user } = useAuth();
  const { showToast } = useToast();
  const canEditMetrics = canFillMetrics(user);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [week, setWeek] = useState(() => currentWeek(now));
  const [squadFilter, setSquadFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [campaignsByClient, setCampaignsByClient] = useState({});
  const [campaignModalClient, setCampaignModalClient] = useState(null);
  const [campaignListClient, setCampaignListClient] = useState(null);
  const [campaignDraft, setCampaignDraft] = useState('');
  const [pendingDeleteCampaign, setPendingDeleteCampaign] = useState(null);
  const [summaryReloadKey, setSummaryReloadKey] = useState(0);
  const [monthlySummaryByClient, setMonthlySummaryByClient] = useState({});
  const loadErrorToastRef = useRef('');

  const periodKey = useMemo(() => buildPeriodKey(year, month0, week), [year, month0, week]);
  const summaryDate = useMemo(() => weekReferenceDate(year, month0, week), [month0, week, year]);

  const handleMetricSaved = useCallback(() => {
    setSummaryReloadKey((value) => value + 1);
  }, []);

  const handleMetricLoadError = useCallback(() => {
    if (loadErrorToastRef.current === periodKey) return;
    loadErrorToastRef.current = periodKey;
    showToast('Alguns clientes não foram carregados. Verifique a API e tente novamente.', 'error');
  }, [periodKey, showToast]);

  const handleOpenCampaignModal = useCallback((client) => {
    setCampaignModalClient(client || null);
    const existing = normalizeCampaigns(campaignsByClient?.[client?.id]);
    setCampaignDraft(`Campanha ${existing.length + 2}`);
  }, [campaignsByClient]);

  const handleOpenCampaignsModal = useCallback((client) => {
    setCampaignListClient(client || null);
  }, []);

  const handleCloseCampaignsModal = useCallback(() => {
    setCampaignListClient(null);
  }, []);

  const handleCloseCampaignModal = useCallback(() => {
    setCampaignModalClient(null);
    setCampaignDraft('');
  }, []);

  const handleCreateCampaign = useCallback(async (event) => {
    event?.preventDefault?.();
    if (!campaignModalClient?.id) return;
    const existing = normalizeCampaigns(campaignsByClient?.[campaignModalClient.id]);
    const requestedName = campaignDraft.trim() || `Campanha ${existing.length + 2}`;

    try {
      const res = await createMetricCampaign({
        clientId: campaignModalClient.id,
        periodKey,
        name: requestedName,
      });
      const created = normalizeCampaigns([res?.campaign || res?.metricCampaign || res])?.[0];
      if (!created?.id) throw new Error('Campanha inválida');

      setCampaignsByClient((current) => {
        const currentList = normalizeCampaigns(current?.[campaignModalClient.id]);
        return {
          ...current,
          [campaignModalClient.id]: [...currentList.filter((campaign) => campaign.id !== created.id), created],
        };
      });
      if (campaignListClient?.id === campaignModalClient.id) {
        setCampaignListClient(campaignModalClient);
      }
      handleCloseCampaignModal();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        showToast('Backend de campanhas ainda não publicado', 'error');
      } else {
        showToast('Erro ao criar campanha', 'error');
      }
    }
  }, [campaignDraft, campaignListClient?.id, campaignModalClient, campaignsByClient, handleCloseCampaignModal, periodKey, showToast]);

  const handleRequestDeleteCampaign = useCallback((clientId, campaign) => {
    if (!clientId || !campaign?.id) return;
    setPendingDeleteCampaign({
      clientId,
      campaignId: campaign.id,
      name: campaign.name || 'campanha',
    });
  }, []);

  const handleCancelDeleteCampaign = useCallback(() => {
    setPendingDeleteCampaign(null);
  }, []);

  const handleConfirmDeleteCampaign = useCallback(async () => {
    if (!pendingDeleteCampaign?.clientId || !pendingDeleteCampaign?.campaignId) return;
    const { clientId, campaignId } = pendingDeleteCampaign;

    try {
      await deleteMetricCampaign(campaignId);
      setCampaignsByClient((current) => {
        const existing = normalizeCampaigns(current?.[clientId]);
        const nextCampaigns = existing.filter((campaign) => campaign.id !== campaignId);
        const nextStore = { ...current };
        if (nextCampaigns.length > 0) {
          nextStore[clientId] = nextCampaigns;
        } else {
          delete nextStore[clientId];
          if (campaignListClient?.id === clientId) {
            setCampaignListClient(null);
          }
        }
        return nextStore;
      });
      setPendingDeleteCampaign(null);
    } catch {
      showToast('Erro ao excluir campanha', 'error');
    }
  }, [campaignListClient?.id, pendingDeleteCampaign, showToast]);

  useEffect(() => {
    let cancelled = false;

    async function loadMonthlySummary() {
      try {
        const res = await getContractsSummary({
          date: summaryDate,
          squadId: squadFilter || undefined,
          clientId: clientFilter || undefined,
        });
        if (cancelled) return;
        const next = {};
        (Array.isArray(res?.clients) ? res.clients : []).forEach((item) => {
          if (item?.clientId) next[item.clientId] = item;
        });
        setMonthlySummaryByClient(next);
      } catch {
        if (!cancelled) setMonthlySummaryByClient({});
      }
    }

    void loadMonthlySummary();

    return () => {
      cancelled = true;
    };
  }, [clientFilter, squadFilter, summaryDate, summaryReloadKey]);

  const activeClients = useMemo(
    () => (Array.isArray(clients) ? clients.filter((client) => client && isActiveClientStatus(client.status)) : []),
    [clients]
  );

  const squadsAvailable = useMemo(() => {
    const isAdmin = user?.role === 'admin' || user?.isMaster;
    if (isAdmin) return squads;
    const allowed = Array.isArray(user?.squads) ? user.squads : [];
    return squads.filter((squad) => allowed.includes(squad.id));
  }, [squads, user]);

  const monthOptions = useMemo(() => {
    const options = [];
    for (let index = 0; index < 12; index += 1) {
      let optionYear = now.getFullYear();
      let optionMonth = now.getMonth() - index;
      while (optionMonth < 0) {
        optionMonth += 12;
        optionYear -= 1;
      }
      options.push({ y: optionYear, m: optionMonth, label: `${MONTHS_FULL[optionMonth]} ${optionYear}` });
    }
    return options;
  }, [now]);

  const filteredClients = useMemo(() => {
    let list = Array.isArray(clients) ? clients.filter((client) => client && isActiveClientStatus(client.status)) : [];
    if (squadFilter) list = list.filter((client) => (client.squadId || client.squad_id) === squadFilter);
    if (clientFilter) list = list.filter((client) => client.id === clientFilter);

    if (query.trim()) {
      list = list.filter((client) =>
        matchesAnySearch([client.name, client.squadName, client.gdvName, client.gestor], query)
      );
    }

    return [...list].sort((a, b) => {
      const squadCompare = String(a.squadName || '').localeCompare(String(b.squadName || ''), 'pt-BR');
      if (squadCompare !== 0) return squadCompare;
      return String(a.name).localeCompare(String(b.name), 'pt-BR');
    });
  }, [clientFilter, clients, query, squadFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / pageSize));
  const visibleClients = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return filteredClients.slice(start, start + pageSize);
  }, [filteredClients, page, pageSize, totalPages]);

  const groupedVisibleClients = useMemo(() => {
    const map = new Map();
    visibleClients.forEach((client) => {
      const key = client.squadId || client.squad_id || client.squadName || 'sem-squad';
      const label = client.squadName || 'Sem squad';
      if (!map.has(key)) {
        map.set(key, { key, label, clients: [] });
      }
      map.get(key).clients.push(client);
    });
    return Array.from(map.values());
  }, [visibleClients]);

  useEffect(() => {
    if (!visibleClients.length) {
      setCampaignsByClient({});
      return undefined;
    }

    let cancelled = false;
    const clientIds = visibleClients.map((client) => client.id);

    async function loadCampaigns() {
      try {
        const res = await listMetricCampaigns({ clientIds, periodKey });
        if (cancelled) return;
        const source = res?.campaignsByClient || res?.byClient || {};
        const next = {};
        clientIds.forEach((clientId) => {
          next[clientId] = normalizeCampaigns(source?.[clientId]);
        });
        setCampaignsByClient(next);
      } catch {
        if (!cancelled) setCampaignsByClient({});
      }
    }

    void loadCampaigns();

    return () => {
      cancelled = true;
    };
  }, [periodKey, visibleClients]);


  useEffect(() => {
    setPage(1);
  }, [clientFilter, pageSize, query, squadFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const title = (
      <>
        <strong>Preencher Semana</strong>
        <span>·</span>
        <span>{`${MONTHS_FULL[month0]} ${year} · S${week}`}</span>
      </>
    );

    const actions = (
      <div className={styles.headerControls}>
        <span className={styles.headerStat} title={`${fmtInt(filteredClients.length)} clientes visíveis`}>
          <UsersIcon size={14} aria-hidden="true" />
          <strong>{fmtInt(filteredClients.length)}</strong>
          <small>{filteredClients.length === 1 ? 'cliente' : 'clientes'}</small>
        </span>

        {squadsAvailable.length > 0 ? (
          <Select
            type="squad"
            className={styles.select}
            value={squadFilter}
            onChange={(event) => {
              setSquadFilter(event.target.value);
              setClientFilter('');
            }}
            aria-label="Filtrar por squad"
            placeholder="Todos squads"
          >
            <option value="">Todos squads</option>
            {squadsAvailable.map((squad) => (
              <option
                key={squad.id}
                value={squad.id}
                data-avatar={getSquadAvatar(squad) || squad.avatarUrl || squad.logoUrl || ''}
                data-name={squad.name}
              >
                {squad.name}
              </option>
            ))}
          </Select>
        ) : null}

        <Select
          type="client"
          className={styles.select}
          value={clientFilter}
          onChange={(event) => setClientFilter(event.target.value)}
          aria-label="Filtrar por cliente"
          placeholder="Todos clientes"
        >
          <option value="">Todos clientes</option>
          {filteredClientsForSelect(clients, squadFilter).map((client) => (
            <option
              key={client.id}
              value={client.id}
              data-avatar={getClientAvatar(client) || client.avatarUrl || ''}
              data-name={client.name}
            >
              {client.name}{isPremiumClient(client) ? ' — Premium' : ''}
            </option>
          ))}
        </Select>

        <Select
          className={styles.select}
          value={`${year}-${month0}`}
          onChange={(event) => {
            const [nextYear, nextMonth] = event.target.value.split('-').map(Number);
            if (Number.isFinite(nextYear) && Number.isFinite(nextMonth)) {
              setYear(nextYear);
              setMonth0(nextMonth);
            }
          }}
          aria-label="Mês"
          placeholder="Selecionar mês"
        >
          {monthOptions.map((option) => (
            <option key={`${option.y}-${option.m}`} value={`${option.y}-${option.m}`}>
              {option.label}
            </option>
          ))}
        </Select>

        <div className={styles.weekTabs} role="tablist" aria-label="Semana">
          {[1, 2, 3, 4].map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={week === value}
              className={`${styles.weekTab} ${week === value ? styles.weekTabActive : ''}`.trim()}
              onClick={() => setWeek(value)}
            >
              S{value}
            </button>
          ))}
        </div>
      </div>
    );

    setPanelHeader({ title, actions });
  }, [
    clientFilter,
    clients,
    filteredClients.length,
    month0,
    monthOptions,
    setPanelHeader,
    squadFilter,
    squadsAvailable,
    week,
    year,
  ]);

  if (shellLoading && clients.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.workspace}>
          <StateBlock
            variant="loading"
            title="Carregando semana"
            description="Sincronizando clientes e estrutura operacional da semana."
          />
        </div>
      </div>
    );
  }

  if (filteredClients.length === 0 && activeClients.length === 0 && !query.trim() && !squadFilter && !clientFilter) {
    return (
      <div className={styles.page}>
        <div className={styles.workspace}>
          <div className={styles.emptyState}>
            <h2>Nenhum cliente</h2>
            <p>
              {squadFilter || clientFilter
                ? 'Ajuste os filtros para ver outros clientes.'
                : 'Cadastre clientes ativos em Clientes para começar.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.workspace}>
        <section className={styles.cardsPanel}>
          <div className={styles.commandBar}>
            <label className={styles.searchField}>
              <SearchIcon size={15} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cliente, squad, GDV ou gestor"
              />
            </label>

            <div className={styles.commandActions}>
              <span className={styles.resultCount}>{filteredClients.length}</span>
              <Select
                className={styles.pageSizeSelect}
                value={String(pageSize)}
                onChange={(event) => setPageSize(Number(event.target.value) || 10)}
                aria-label="Quantidade de clientes por página"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} por página
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {filteredClients.length === 0 ? (
            <div className={styles.emptyTableState}>
              <h2>Nenhum resultado</h2>
              <p>Tente ajustar os filtros ou a busca para encontrar outros clientes.</p>
            </div>
          ) : (
            <div className={styles.groupsWrap}>
              {groupedVisibleClients.map((group) => (
                <section key={group.key} className={styles.squadGroup}>
                  <header className={styles.squadGroupHeader}>
                    <strong>{group.label}</strong>
                    <span>{group.clients.length} cliente(s)</span>
                  </header>

                  <div className={styles.cardsStack}>
                    {group.clients.map((client) => {
                      const clientCampaigns = normalizeCampaigns(campaignsByClient?.[client.id]);

                      return (
                        <WeekCard
                          key={`${client.id}-${periodKey}`}
                          client={client}
                          periodKey={periodKey}
                          week={week}
                          campaignCount={clientCampaigns.length}
                          monthlySummary={monthlySummaryByClient?.[client.id] || null}
                          canEdit={canEditMetrics}
                          onSaved={handleMetricSaved}
                          onRequestCampaign={handleOpenCampaignModal}
                          onRequestCampaigns={handleOpenCampaignsModal}
                          onLoadError={handleMetricLoadError}
                        />
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          {filteredClients.length > pageSize ? (
            <div className={styles.pagination}>
              <span>
                Exibindo {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredClients.length)} de{' '}
                {filteredClients.length}
              </span>
              <div className={styles.pageButtons}>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`${styles.pageButton} ${page === value ? styles.pageButtonActive : ''}`.trim()}
                    onClick={() => setPage(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {campaignListClient ? createPortal((
          <div className={styles.campaignModalOverlay} role="presentation" onClick={handleCloseCampaignsModal}>
            <section className={styles.campaignListModal} onClick={(event) => event.stopPropagation()}>
              <header className={styles.campaignModalHeader}>
                <div>
                  <h2>Outras campanhas</h2>
                  <p>{campaignListClient.name}</p>
                </div>
                <div className={styles.campaignModalActions}>
                  {canEditMetrics ? (
                    <button
                      type="button"
                      className={styles.campaignCreateButton}
                      onClick={() => handleOpenCampaignModal(campaignListClient)}
                    >
                      Nova campanha
                    </button>
                  ) : null}
                  <button type="button" className={styles.campaignModalClose} onClick={handleCloseCampaignsModal} aria-label="Fechar">
                    ×
                  </button>
                </div>
              </header>

              <div className={styles.campaignListBody}>
                {normalizeCampaigns(campaignsByClient?.[campaignListClient.id]).length === 0 ? (
                  <div className={styles.campaignEmptyState}>Nenhuma campanha adicional criada.</div>
                ) : (
                  normalizeCampaigns(campaignsByClient?.[campaignListClient.id]).map((campaign) => (
                    <section key={campaign.id} className={styles.campaignCardShell}>
                      <div className={styles.campaignCardTopbar}>
                        <strong>{campaign.name}</strong>
                        {canEditMetrics ? (
                          <button
                            type="button"
                            className={styles.deleteCampaignButton}
                            onClick={() => handleRequestDeleteCampaign(campaignListClient.id, campaign)}
                            aria-label={`Excluir ${campaign.name}`}
                            title="Excluir campanha"
                          >
                            <TrashIcon size={14} aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                      <WeekCard
                        client={campaignListClient}
                        periodKey={campaignMetricPeriodKey(periodKey, campaign)}
                        week={week}
                        campaignLabel={campaign.name}
                        monthlySummary={monthlySummaryByClient?.[campaignListClient.id] || null}
                        canEdit={canEditMetrics}
                        onSaved={handleMetricSaved}
                        onRequestCampaign={handleOpenCampaignModal}
                        onLoadError={handleMetricLoadError}
                      />
                    </section>
                  ))
                )}
              </div>
            </section>
          </div>
        ), document.body) : null}

        {pendingDeleteCampaign ? createPortal((
          <div className={styles.campaignModalOverlay} role="presentation" onClick={handleCancelDeleteCampaign}>
            <section className={styles.campaignConfirmModal} onClick={(event) => event.stopPropagation()}>
              <header className={styles.campaignConfirmHeader}>
                <h2>Excluir campanha</h2>
                <p>Esta ação remove os campos e dados desta campanha.</p>
              </header>
              <div className={styles.campaignConfirmBody}>
                <strong>{pendingDeleteCampaign.name}</strong>
              </div>
              <footer className={styles.campaignConfirmFooter}>
                <button type="button" className={styles.campaignCancelButton} onClick={handleCancelDeleteCampaign}>
                  Cancelar
                </button>
                <button type="button" className={styles.campaignDeleteConfirmButton} onClick={handleConfirmDeleteCampaign}>
                  Excluir
                </button>
              </footer>
            </section>
          </div>
        ), document.body) : null}

        {campaignModalClient ? createPortal((
          <div className={styles.campaignModalOverlay} role="presentation" onClick={handleCloseCampaignModal}>
            <form className={styles.campaignModal} onSubmit={handleCreateCampaign} onClick={(event) => event.stopPropagation()}>
              <header className={styles.campaignModalHeader}>
                <div>
                  <h2>Nova campanha</h2>
                  <p>{campaignModalClient.name}</p>
                </div>
                <button type="button" className={styles.campaignModalClose} onClick={handleCloseCampaignModal} aria-label="Fechar">
                  ×
                </button>
              </header>

              <div className={styles.campaignModalBody}>
                <label className={styles.campaignField}>
                  <span>Nome da campanha</span>
                  <input
                    type="text"
                    value={campaignDraft}
                    onChange={(event) => setCampaignDraft(event.target.value)}
                    autoFocus
                    placeholder="Campanha 2"
                  />
                </label>
              </div>

              <footer className={styles.campaignModalFooter}>
                <button type="button" className={styles.campaignCancelButton} onClick={handleCloseCampaignModal}>
                  Cancelar
                </button>
                <button type="submit" className={styles.campaignCreateButton}>
                  Criar campos
                </button>
              </footer>
            </form>
          </div>
        ), document.body) : null}
      </div>
    </div>
  );
}
