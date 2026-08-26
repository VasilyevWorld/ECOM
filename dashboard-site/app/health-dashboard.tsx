'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

const integerFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

const marketplaceDefinitions = [
  {
    id: 'traffic',
    name: 'Количество привлеченных клиентов',
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
            <article className="operation-card">
              <h3>Упущенная выручка</h3><p>За прошедшую неделю</p>
              <div className="operation-split"><span>Ozon<strong>{data?.lostRevenue.ozon[week].display ?? '—'}</strong></span><span>WildBerries<strong>{data?.lostRevenue.wildberries[week].display ?? '—'}</strong></span></div>
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

        <footer><span>Источник: вкладка «Здоровье»</span><a href={SOURCE_URL} target="_blank" rel="noreferrer">Открыть исходную таблицу</a></footer>
      </section>
    </main>
  );
}
