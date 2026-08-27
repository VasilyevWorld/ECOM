'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const SHEET_ID = '10nUim3pWy3qxovj7YTqZ_Z5pOojFEgCusXPNps65wyM';
const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=1171665282#gid=1171665282`;
const QUERY_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${encodeURIComponent('Здоровье')}&range=A1:K69&headers=0`;

type DataTable = {
  getNumberOfColumns(): number;
  getNumberOfRows(): number;
  getFormattedValue(row: number, column: number): string;
  getValue(row: number, column: number): number | string | null;
};
type QueryResponse = {
  isError(): boolean;
  getMessage(): string;
  getDetailedMessage(): string;
  getDataTable(): DataTable;
};
type Cell = { display: string; numeric: number | null };
type MetricUnit = 'number' | 'percent';
type MarketplaceMetric = {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  unit: MetricUnit;
  inverse?: boolean;
  overall: Cell[];
  ozon: { completion: Cell[]; plan: Cell[]; actual: Cell[] };
  wildberries: { completion: Cell[]; plan: Cell[]; actual: Cell[] };
};
type HealthDashboardData = {
  weeks: string[];
  funnel: MarketplaceMetric[];
  separate: MarketplaceMetric[];
  lostRevenue: { ozon: Cell[]; wildberries: Cell[] };
  outOfStock: Cell[];
  turnover: Cell[];
  revenue: { trend: Cell[]; plan: Cell[]; actual: Cell[]; completion: Cell[] };
  latest: number;
};
type HealthChartMetric = {
  id: string;
  name: string;
  shortName: string;
  inverse: boolean;
  kind: 'completion' | 'currency';
  overall: Cell[];
};

const integerFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const marketplaceDefinitions = [
  {
    id: 'traffic',
    name: 'Количество привлеченных клиентов',
    shortName: 'Привлечение',
    description: 'Сколько вошли в магазин',
    unit: 'number',
    overall: 2,
    ozonCompletion: 3,
    ozonPlan: 4,
    ozonActual: 5,
    wildberriesCompletion: 6,
    wildberriesPlan: 7,
    wildberriesActual: 8,
    group: 'funnel',
  },
  {
    id: 'cart',
    name: 'Количество положивших в корзину',
    shortName: 'Корзина',
    description: 'Скольких вошедших заинтересовал наш товар',
    unit: 'number',
    overall: 9,
    ozonCompletion: 10,
    ozonPlan: 11,
    ozonActual: 12,
    wildberriesCompletion: 13,
    wildberriesPlan: 14,
    wildberriesActual: 15,
    group: 'funnel',
  },
  {
    id: 'orders',
    name: 'Количество желающих купить',
    shortName: 'Заказы',
    description: 'Сколько клиентов выбрали нас и заказали товар',
    unit: 'number',
    overall: 16,
    ozonCompletion: 17,
    ozonPlan: 18,
    ozonActual: 19,
    wildberriesCompletion: 20,
    wildberriesPlan: 21,
    wildberriesActual: 22,
    group: 'funnel',
  },
  {
    id: 'buyers',
    name: 'Количество купивших',
    shortName: 'Покупатели',
    description: 'Сколько клиентов выкупили наш товар и отдали нам свои деньги',
    unit: 'number',
    overall: 23,
    ozonCompletion: 24,
    ozonPlan: 25,
    ozonActual: 26,
    wildberriesCompletion: 27,
    wildberriesPlan: 28,
    wildberriesActual: 29,
    group: 'funnel',
  },
  {
    id: 'conversion',
    name: 'Конверсия в покупку',
    shortName: 'Конверсия',
    unit: 'percent',
    overall: 30,
    ozonCompletion: 31,
    ozonPlan: 32,
    ozonActual: 33,
    wildberriesCompletion: 34,
    wildberriesPlan: 35,
    wildberriesActual: 36,
    group: 'separate',
  },
  {
    id: 'average-check',
    name: 'Средний чек',
    shortName: 'Средний чек',
    unit: 'number',
    overall: 39,
    ozonCompletion: 40,
    ozonPlan: 41,
    ozonActual: 42,
    wildberriesCompletion: 43,
    wildberriesPlan: 44,
    wildberriesActual: 45,
    group: 'separate',
  },
  {
    id: 'ad-cost',
    name: 'Доля рекламных расходов',
    shortName: 'Реклама',
    description: 'Чем ниже процент, тем лучше',
    unit: 'percent',
    inverse: true,
    overall: 46,
    ozonCompletion: 47,
    ozonPlan: 48,
    ozonActual: 49,
    wildberriesCompletion: 50,
    wildberriesPlan: 51,
    wildberriesActual: 52,
    group: 'separate',
  },
] as const;

function loadGoogleCharts() {
  return new Promise<void>((resolve, reject) => {
    const start = () => {
      window.google?.charts.load('current', { packages: ['corechart'] });
      window.google?.charts.setOnLoadCallback(resolve);
    };
    if (window.google?.charts) return start();
    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/charts/loader.js';
    script.async = true;
    script.dataset.googleChartsLoader = 'true';
    script.onload = start;
    script.onerror = () => reject(new Error('Не удалось загрузить модуль данных.'));
    document.head.appendChild(script);
  });
}

function clean(value: string) {
  const normalized = value.trim().replaceAll('\u00a0', ' ');
  return normalized && normalized !== '-' ? normalized : '—';
}

function readCell(table: DataTable, row: number, column: number): Cell {
  const raw = table.getValue(row, column);
  return {
    display: clean(table.getFormattedValue(row, column)),
    numeric: typeof raw === 'number' && Number.isFinite(raw) ? raw : null,
  };
}

function parseHealthDashboard(table: DataTable): HealthDashboardData {
  if (table.getNumberOfRows() < 59 || table.getNumberOfColumns() < 11) {
    throw new Error('Во вкладке «Здоровье» отсутствуют ожидаемые показатели.');
  }
  const columns = Array.from({ length: 10 }, (_, index) => index + 1);
  const cells = (row: number) => columns.map((column) => readCell(table, row, column));
  const metrics: MarketplaceMetric[] = marketplaceDefinitions.map((definition) => ({
    id: definition.id,
    name: definition.name,
    shortName: definition.shortName,
    description: 'description' in definition ? definition.description : undefined,
    unit: definition.unit,
    inverse: 'inverse' in definition ? definition.inverse : undefined,
    overall: cells(definition.overall),
    ozon: {
      completion: cells(definition.ozonCompletion),
      plan: cells(definition.ozonPlan),
      actual: cells(definition.ozonActual),
    },
    wildberries: {
      completion: cells(definition.wildberriesCompletion),
      plan: cells(definition.wildberriesPlan),
      actual: cells(definition.wildberriesActual),
    },
  }));
  const revenue = { trend: cells(55), plan: cells(56), actual: cells(57), completion: cells(58) };
  let latest = 0;
  columns.forEach((_, index) => {
    if (revenue.actual[index].display !== '—') latest = index;
  });
  return {
    weeks: columns.map((column) => readCell(table, 1, column).display),
    funnel: metrics.filter((metric) => marketplaceDefinitions.find((item) => item.id === metric.id)?.group === 'funnel'),
    separate: metrics.filter((metric) => marketplaceDefinitions.find((item) => item.id === metric.id)?.group === 'separate'),
    lostRevenue: { ozon: cells(37), wildberries: cells(38) },
    outOfStock: cells(53),
    turnover: cells(54),
    revenue,
    latest,
  };
}

function asPercent(cell: Cell) {
  const value = Number(cell.display.replaceAll(' ', '').replace('%', '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function standardTone(cell: Cell | undefined) {
  if (!cell) return 'neutral';
  const value = asPercent(cell);
  if (value === null) return 'neutral';
  if (value > 95) return 'good';
  if (value >= 80) return 'warning';
  return 'risk';
}

function inverseTone(cell: Cell | undefined) {
  if (!cell) return 'neutral';
  const value = asPercent(cell);
  if (value === null) return 'neutral';
  if (value <= 100) return 'good';
  if (value <= 120) return 'warning';
  return 'risk';
}

function shown(cell: Cell, unit: MetricUnit) {
  if (cell.display === '—') return '—';
  if (unit === 'number' && cell.numeric !== null) return integerFormatter.format(cell.numeric);
  return unit === 'percent' && !cell.display.includes('%') ? `${cell.display}%` : cell.display;
}

function shownCurrency(cell: Cell | undefined) {
  if (!cell || cell.display === '—' || cell.numeric === null) return '—';
  return `${integerFormatter.format(cell.numeric)} ₽`;
}

function smoothPath(points: { x: number; y: number }[]) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const beforePrevious = points[index - 2] ?? previous;
    const next = points[index + 1] ?? point;
    const tension = 0.14;
    const control1 = {
      x: previous.x + (point.x - beforePrevious.x) * tension,
      y: previous.y + (point.y - beforePrevious.y) * tension,
    };
    const control2 = {
      x: point.x - (next.x - previous.x) * tension,
      y: point.y - (next.y - previous.y) * tension,
    };
    return `${path} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${point.x} ${point.y}`;
  }, '');
}

function MarketplaceCard({ metric, week }: { metric: MarketplaceMetric; week: number }) {
  const tone = metric.inverse ? inverseTone : standardTone;
  const overallTone = tone(metric.overall[week]);
  const stores = [
    { name: 'Ozon', data: metric.ozon },
    { name: 'WildBerries', data: metric.wildberries },
  ];
  return (
    <article className="health-card">
      <div className="health-card-heading">
        <div><h3>{metric.name}</h3>{metric.description && <p>{metric.description}</p>}</div>
        <strong className={`health-score ${overallTone}`}>{metric.overall[week].display}</strong>
      </div>
      <span className="health-score-caption">Общее выполнение плана</span>
      <div className="marketplace-list">
        {stores.map((store) => {
          const storeTone = tone(store.data.completion[week]);
          return (
            <div className="marketplace-row" key={store.name}>
              <div className="marketplace-name"><strong>{store.name}</strong><span className={storeTone}>{store.data.completion[week].display}</span></div>
              <div className="marketplace-values"><span>План <strong className="plan-value">{shown(store.data.plan[week], metric.unit)}</strong></span><span>Факт <strong className={storeTone}>{shown(store.data.actual[week], metric.unit)}</strong></span></div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export default function HealthDashboard({ onShowResults }: { onShowResults: () => void }) {
  const [data, setData] = useState<HealthDashboardData | null>(null);
  const [week, setWeek] = useState(0);
  const [metricId, setMetricId] = useState('traffic');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoad = useRef(true);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      await loadGoogleCharts();
      const google = window.google;
      if (!google?.visualization) throw new Error('Модуль данных недоступен.');
      const result = await new Promise<HealthDashboardData>((resolve, reject) => {
        const query = new google.visualization.Query(QUERY_URL, { sendMethod: 'scriptInjection' });
        query.send((response: QueryResponse) => {
          if (response.isError()) {
            reject(new Error(`${response.getMessage()} ${response.getDetailedMessage()}`.trim()));
            return;
          }
          try {
            resolve(parseHealthDashboard(response.getDataTable()));
          } catch (queryError) {
            reject(queryError);
          }
        });
      });
      setData(result);
      if (initialLoad.current) {
        setWeek(result.latest);
        initialLoad.current = false;
      } else {
        setWeek((current) => Math.min(current, result.weeks.length - 1));
      }
      setUpdatedAt(new Date());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Не удалось получить данные.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const turnover = data?.turnover[week];
  const turnoverTone = !turnover || turnover.numeric === null ? 'neutral' : turnover.numeric <= 45 ? 'good' : turnover.numeric <= 54 ? 'warning' : 'risk';
  const stock = data?.outOfStock[week];
  const stockTone = !stock || stock.display === '—' ? 'neutral' : stock.numeric === 0 ? 'good' : 'risk';
  const revenueCompletion = data?.revenue.completion[week];
  const revenueTone = standardTone(revenueCompletion);
  const lostRevenueOzon = data?.lostRevenue.ozon[week];
  const lostRevenueWildberries = data?.lostRevenue.wildberries[week];
  const lostRevenueTotal = lostRevenueOzon?.numeric !== null && lostRevenueOzon?.numeric !== undefined && lostRevenueWildberries?.numeric !== null && lostRevenueWildberries?.numeric !== undefined
    ? lostRevenueOzon.numeric + lostRevenueWildberries.numeric
    : null;
  const chartMetrics = useMemo<HealthChartMetric[]>(() => {
    if (!data) return [];
    return [
      ...[...data.funnel, ...data.separate].map((metric) => ({
        id: metric.id,
        name: metric.name,
        shortName: metric.shortName,
        inverse: metric.inverse ?? false,
        kind: 'completion' as const,
        overall: metric.overall,
      })),
      {
        id: 'lost-revenue',
        name: 'Упущенная выручка',
        shortName: 'Упущенная выручка',
        inverse: false,
        kind: 'currency',
        overall: data.weeks.map((_, index) => {
          const ozon = data.lostRevenue.ozon[index].numeric;
          const wildberries = data.lostRevenue.wildberries[index].numeric;
          const total = ozon !== null && wildberries !== null ? Math.abs(ozon + wildberries) : null;
          return { display: total === null ? '—' : `−${integerFormatter.format(total)} ₽`, numeric: total };
        }),
      },
      {
        id: 'turnover',
        name: 'Оборачиваемость',
        shortName: 'Оборачиваемость',
        inverse: false,
        kind: 'completion',
        overall: data.turnover.map((cell) => {
          const completion = cell.numeric && cell.numeric > 0 ? (45 / cell.numeric) * 100 : null;
          return { display: completion === null ? '—' : `${percentFormatter.format(completion)}%`, numeric: completion === null ? null : completion / 100 };
        }),
      },
      {
        id: 'revenue',
        name: 'Выполнение плана по выручке',
        shortName: 'Выручка',
        inverse: false,
        kind: 'completion',
        overall: data.revenue.completion,
      },
    ];
  }, [data]);
  const chartMetric = useMemo(
    () => chartMetrics.find((metric) => metric.id === metricId) ?? chartMetrics[0] ?? null,
    [chartMetrics, metricId],
  );
  const chartData = useMemo(() => {
    if (!data || !chartMetric) return [];
    if (chartMetric.kind === 'currency') {
      return data.weeks.flatMap((name, index) => {
        const value = chartMetric.overall[index].numeric;
        if (value === null) return [];
        return [{ name, index, value, deviation: 0, tone: 'risk', label: chartMetric.overall[index].display }];
      });
    }
    const tone = chartMetric.inverse ? inverseTone : standardTone;
    return data.weeks.flatMap((name, index) => {
      const completion = asPercent(chartMetric.overall[index]);
      if (completion === null) return [];
      return [{ name, index, value: completion, deviation: completion - 100, tone: tone(chartMetric.overall[index]), label: chartMetric.overall[index].display }];
    });
  }, [chartMetric, data]);
  const deviationScale = useMemo(() => {
    const maximum = Math.max(...chartData.map((item) => Math.abs(item.deviation)), 10);
    return Math.ceil(maximum / 10) * 10;
  }, [chartData]);
  const currencyScale = useMemo(() => {
    const maximum = Math.max(...chartData.map((item) => item.value), 1);
    const magnitude = 10 ** Math.floor(Math.log10(maximum));
    const step = magnitude / 2;
    return Math.ceil(maximum / step) * step;
  }, [chartData]);
  const trendPoints = useMemo(() => chartData.map((item, index) => ({
    x: ((index + 0.5) / chartData.length) * 1000,
    y: chartMetric?.kind === 'currency' ? 26 + (Math.max(item.value, 0) / currencyScale) * 208 : 130 - (item.deviation / deviationScale) * 104,
  })), [chartData, chartMetric?.kind, currencyScale, deviationScale]);

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div><p className="eyebrow">Ecom · отчёт собственника</p><h1>Здоровье</h1></div>
        <nav className="dashboard-nav" aria-label="Выбор дашборда">
          <button type="button" onClick={onShowResults}>Результат</button>
          <button type="button" className="active">Здоровье</button>
        </nav>
        <div className="source-state">
          <span className={`live-dot ${error ? 'is-error' : ''}`} aria-hidden="true" />
          <div><strong>{error ? 'Источник недоступен' : 'Автоматическое обновление'}</strong><span>{updatedAt ? `Проверено в ${updatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'Подключение к таблице'}</span></div>
          <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? 'Обновление…' : 'Обновить'}</button>
        </div>
      </header>

      <section className="content health-content">
        {error && <div className="error-banner" role="alert"><strong>Не удалось обновить данные.</strong><span>{error}</span></div>}
        <div className="period-row">
          <div><span className="section-kicker">Неделя</span><h2>{data?.weeks[week] ?? 'Загрузка данных'}</h2></div>
          <div className="month-switcher health-week-switcher" aria-label="Выбор недели">
            {data?.weeks.map((name, index) => <button type="button" key={`${name}-${index}`} className={index === week ? 'active' : ''} onClick={() => setWeek(index)}>{name.slice(0, 5)}</button>)}
          </div>
        </div>

        <section className="health-section" aria-labelledby="store-mechanics-title">
          <div className="health-section-heading"><span className="section-kicker">Путь клиента</span><h2 id="store-mechanics-title">Механика магазина</h2></div>
          <div className="health-grid funnel-grid">
            {data ? data.funnel.map((metric) => <MarketplaceCard key={metric.id} metric={metric} week={week} />) : Array.from({ length: 4 }, (_, index) => <div className="health-card skeleton" key={index} />)}
          </div>
        </section>

        <section className="health-section" aria-labelledby="separate-metrics-title">
          <div className="health-section-heading"><span className="section-kicker">Контроль эффективности</span><h2 id="separate-metrics-title">Отдельные метрики</h2></div>
          <div className="health-grid separate-grid">
            {data ? data.separate.map((metric) => <MarketplaceCard key={metric.id} metric={metric} week={week} />) : Array.from({ length: 3 }, (_, index) => <div className="health-card skeleton" key={index} />)}
          </div>
        </section>

        <section className="health-section" aria-labelledby="operations-title">
          <div className="health-section-heading"><span className="section-kicker">Риски и деньги</span><h2 id="operations-title">Операционные показатели</h2></div>
          <div className="operations-grid">
            <article className="operation-card lost-revenue-card">
              <h3>Упущенная выручка</h3><p>За прошедшую неделю</p>
              <strong className="operation-value risk">{lostRevenueTotal === null ? '—' : `${integerFormatter.format(lostRevenueTotal)} ₽`}</strong>
              <span className="operation-value-caption">Общее значение</span>
              <div className="operation-split"><span>Ozon<strong>{shownCurrency(lostRevenueOzon)}</strong></span><span>WildBerries<strong>{shownCurrency(lostRevenueWildberries)}</strong></span></div>
            </article>
            <article className="operation-card">
              <h3>Оборачиваемость</h3><p>План — <strong className="plan-value">45 дней</strong></p>
              <strong className={`operation-value ${turnoverTone}`}>{turnover?.display === '—' || !turnover ? '—' : `${turnover.display} дней`}</strong>
            </article>
            <article className="operation-card">
              <h3>Out of stock</h3><p>Количество артикулов</p>
              <strong className={`operation-value ${stockTone}`}>{stock?.display ?? '—'}</strong>
            </article>
            <article className="operation-card revenue-operation">
              <div className="operation-heading"><div><h3>Выполнение плана по выручке</h3><p>Динамика к прошлой неделе</p></div><span className={data?.revenue.trend[week].numeric === null ? 'neutral' : (data?.revenue.trend[week].numeric ?? 0) >= 0 ? 'good' : 'risk'}>{data?.revenue.trend[week].display ?? '—'}</span></div>
              <strong className={`operation-value ${revenueTone}`}>{revenueCompletion?.display ?? '—'}</strong>
              <div className="operation-plan-fact"><span>План <strong className="plan-value">{data ? shown(data.revenue.plan[week], 'number') : '—'}</strong></span><span>Факт <strong className={revenueTone}>{data ? shown(data.revenue.actual[week], 'number') : '—'}</strong></span></div>
            </article>
          </div>
        </section>

        <section className="chart-section health-section" aria-labelledby="health-dynamics-title">
          <div className="chart-section-heading">
            <span className="section-kicker">Показатели по неделям</span>
            <h2 id="health-dynamics-title">Динамика</h2>
          </div>
          <div className="chart-panel">
            <div className="panel-heading">
              <div><span className="section-kicker">{chartMetric?.kind === 'currency' ? 'Итоговое значение' : 'Процент выполнения плана'}</span><h3>{chartMetric?.name ?? 'Показатель'}</h3></div>
              <div className="metric-switcher" aria-label="Выбор показателя здоровья">
                {chartMetrics.map((metric) => <button key={metric.id} type="button" className={metric.id === chartMetric?.id ? 'active' : ''} onClick={() => setMetricId(metric.id)}>{metric.shortName}</button>)}
              </div>
            </div>
            {chartData.length ? (
              <div className="deviation-scroll">
                <div className={`deviation-plot ${chartMetric?.kind === 'currency' ? 'absolute-plot' : ''}`} style={{ minWidth: `${Math.max(chartData.length * 118, 620)}px` }} aria-label={`${chartMetric?.name ?? 'Показатель'} по неделям`}>
                  <span className="scale-label scale-top">{chartMetric?.kind === 'currency' ? '0 ₽' : `${100 + deviationScale}%`}</span>
                  <span className="scale-label scale-bottom">{chartMetric?.kind === 'currency' ? `−${integerFormatter.format(currencyScale)} ₽` : `${Math.max(100 - deviationScale, 0)}%`}</span>
                  {chartMetric?.kind !== 'currency' && <div className="plan-baseline"><span>План 100%</span></div>}
                  <svg className="trend-line" viewBox="0 0 1000 260" preserveAspectRatio="none" aria-hidden="true">
                    <path d={smoothPath(trendPoints)} />
                    {trendPoints.map((point, index) => <circle key={`${chartData[index].name}-${index}`} className={chartData[index].tone} cx={point.x} cy={point.y} r="6" vectorEffect="non-scaling-stroke" />)}
                  </svg>
                  <div className="deviation-columns" style={{ gridTemplateColumns: `repeat(${chartData.length}, minmax(80px, 1fr))` }}>
                    {chartData.map((item) => {
                      if (chartMetric?.kind === 'currency') {
                        const height = Math.max((Math.max(item.value, 0) / currencyScale) * 208, 2);
                        const pointTop = 26 + height;
                        return (
                          <div className={`deviation-column ${item.index === week ? 'selected' : ''}`} key={`${item.name}-${item.index}`} aria-label={`${item.name}: ${item.label}`}>
                            <strong className="deviation-label above risk" style={{ top: `${pointTop}px` }}>{item.label}</strong>
                            <span className="absolute-bar risk" style={{ height: `${height}px` }} aria-hidden="true" />
                            <span className="deviation-month">{item.name.slice(0, 5)}</span>
                          </div>
                        );
                      }
                      const height = Math.min((Math.abs(item.deviation) / deviationScale) * 104, 104);
                      const pointTop = 130 - (item.deviation / deviationScale) * 104;
                      return (
                        <div className={`deviation-column ${item.index === week ? 'selected' : ''}`} key={`${item.name}-${item.index}`} aria-label={`${item.name}: выполнение плана ${item.label}`}>
                          <strong className={`deviation-label ${item.deviation >= 0 ? 'above' : 'below'} ${item.tone}`} style={{ top: `${pointTop}px` }}>{item.label}</strong>
                          <span className={`deviation-bar ${item.deviation >= 0 ? 'up' : 'down'} ${item.tone}`} style={{ height: `${height}px` }} aria-hidden="true" />
                          <span className="deviation-month">{item.name.slice(0, 5)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="chart-empty"><strong>График пока недоступен</strong><span>Для показателя «{chartMetric?.name ?? 'Показатель'}» данные не заданы.</span></div>
            )}
          </div>
        </section>

        <footer><span>Источник: вкладка «Здоровье»</span><a href={SOURCE_URL} target="_blank" rel="noreferrer">Открыть исходную таблицу</a></footer>
      </section>
    </main>
  );
}
