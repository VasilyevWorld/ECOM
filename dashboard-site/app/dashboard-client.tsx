'use client';

// Интерактивная часть дашборда отделена от серверной точки входа страницы.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HealthDashboard from './health-dashboard';

const SHEET_ID = '10nUim3pWy3qxovj7YTqZ_Z5pOojFEgCusXPNps65wyM';
const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=0#gid=0`;
const QUERY_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=%D0%A0%D0%B5%D0%B7%D1%83%D0%BB%D1%8C%D1%82%D0%B0%D1%82&range=A1:K26&headers=0`;

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
type Query = { send(callback: (response: QueryResponse) => void): void };

declare global {
  interface Window {
    google?: {
      charts: {
        load(version: string, options: { packages: string[] }): void;
        setOnLoadCallback(callback: () => void): void;
      };
      visualization: {
        Query: new (url: string, options?: { sendMethod: 'scriptInjection' }) => Query;
      };
    };
  }
}

type Cell = { display: string; numeric: number | null };
type Metric = {
  id: string;
  name: string;
  shortName: string;
  unit: 'number' | 'percent';
  trendUnit: 'percent' | 'points';
  plan: Cell[];
  actual: Cell[];
  completion: Cell[];
  trend: Cell[];
};
type Dashboard = { months: string[]; metrics: Metric[]; latest: number };

const integerFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const deviationFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

const definitions = [
  { id: 'revenue', name: 'Выручка', shortName: 'Выручка', unit: 'number', trendUnit: 'percent', trend: 2, plan: 3, actual: 4, completion: 5 },
  { id: 'profit', name: 'Прибыль', shortName: 'Прибыль', unit: 'number', trendUnit: 'percent', trend: 6, plan: 7, actual: 8, completion: 9 },
  { id: 'margin', name: 'Рентабельность', shortName: 'Рентабельность', unit: 'percent', trendUnit: 'points', trend: 10, plan: 11, actual: 12, completion: 13 },
  { id: 'led', name: 'Доля рынка LED', shortName: 'LED', unit: 'percent', trendUnit: 'points', trend: 14, plan: 15, actual: 16, completion: 17 },
  { id: 'cabinets', name: 'Доля рынка Шкафы', shortName: 'Шкафы', unit: 'percent', trendUnit: 'points', trend: 18, plan: 19, actual: 20, completion: 21 },
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

function parseDashboard(table: DataTable): Dashboard {
  if (table.getNumberOfRows() < 22 || table.getNumberOfColumns() < 11) {
    throw new Error('В публичном диапазоне таблицы отсутствуют ожидаемые показатели.');
  }
  const columns = Array.from({ length: 9 }, (_, index) => index + 1);
  const months = [
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ];
  const metrics: Metric[] = definitions.map((item) => ({
    id: item.id,
    name: item.name,
    shortName: item.shortName,
    unit: item.unit,
    trendUnit: item.trendUnit,
    plan: columns.map((column) => readCell(table, item.plan, column)),
    actual: columns.map((column) => readCell(table, item.actual, column)),
    completion: columns.map((column) => readCell(table, item.completion, column)),
    trend: columns.map((column) => readCell(table, item.trend, column)),
  }));
  let latest = 0;
  months.forEach((_, index) => {
    if (metrics.some((metric) => metric.actual[index].display !== '—')) latest = index;
  });
  return { months, metrics, latest };
}

function shown(cell: Cell, unit: Metric['unit']) {
  if (cell.display === '—') return '—';
  if (unit === 'number' && cell.numeric !== null) return integerFormatter.format(cell.numeric);
  return !cell.display.includes('%') ? `${cell.display}%` : cell.display;
}

function trendText(cell: Cell, unit: Metric['trendUnit']) {
  if (cell.display === '—') return 'Нет сравнения';
  const plus = cell.numeric !== null && cell.numeric > 0 ? '+' : '';
  return `${plus}${cell.display}${unit === 'points' ? ' п.п.' : ''}`;
}

function asPercent(cell: Cell) {
  const value = Number(cell.display.replaceAll(' ', '').replace('%', '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function completionTone(cell: Cell | undefined) {
  if (!cell) return 'neutral';
  const value = asPercent(cell);
  if (value === null) return 'neutral';
  if (value > 95) return 'good';
  if (value >= 80) return 'warning';
  return 'risk';
}

function trendTone(cell: Cell) {
  if (cell.numeric === null || cell.numeric === 0) return 'neutral';
  return cell.numeric > 0 ? 'good' : 'risk';
}

function deviationText(value: number) {
  return `${value > 0 ? '+' : ''}${deviationFormatter.format(value)}%`;
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

export default function Home() {
  const [view, setView] = useState<'result' | 'health'>('result');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [month, setMonth] = useState(0);
  const [metricId, setMetricId] = useState('revenue');
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
      const result = await new Promise<Dashboard>((resolve, reject) => {
        const query = new google.visualization.Query(QUERY_URL, { sendMethod: 'scriptInjection' });
        query.send((response) => {
          if (response.isError()) {
            reject(new Error(`${response.getMessage()} ${response.getDetailedMessage()}`.trim()));
            return;
          }
          try {
            resolve(parseDashboard(response.getDataTable()));
          } catch (queryError) {
            reject(queryError);
          }
        });
      });
      setDashboard(result);
      if (initialLoad.current) {
        setMonth(result.latest);
        initialLoad.current = false;
      } else {
        setMonth((current) => Math.min(current, result.months.length - 1));
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

  const chartMetric = useMemo(
    () => dashboard?.metrics.find((metric) => metric.id === metricId) ?? null,
    [dashboard, metricId],
  );
  const deviationData = useMemo(() => {
    if (!dashboard || !chartMetric) return [];
    return dashboard.months.flatMap((name, index) => {
      const completion = asPercent(chartMetric.completion[index]);
      const actual = chartMetric.actual[index];
      if (completion === null || actual.numeric === null) return [];
      return [{ name, index, deviation: completion - 100, tone: completionTone(chartMetric.completion[index]) }];
    });
  }, [chartMetric, dashboard]);
  const deviationScale = useMemo(() => {
    const maximum = Math.max(...deviationData.map((item) => Math.abs(item.deviation)), 10);
    return Math.ceil(maximum / 10) * 10;
  }, [deviationData]);
  const trendPoints = useMemo(() => deviationData.map((item, index) => ({
    x: ((index + 0.5) / deviationData.length) * 1000,
    y: 130 - (item.deviation / deviationScale) * 104,
  })), [deviationData, deviationScale]);

  if (view === 'health') return <HealthDashboard onShowResults={() => setView('result')} />;

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CONTINENT • ECOM</p>
          <h1>Результат</h1>
        </div>
        <nav className="dashboard-nav" aria-label="Выбор дашборда">
          <button type="button" className="active">Результат</button>
          <button type="button" onClick={() => setView('health')}>Здоровье</button>
        </nav>
        <div className="source-state">
          <span className={`live-dot ${error ? 'is-error' : ''}`} aria-hidden="true" />
          <div>
            <strong className={error ? '' : 'source-status-label'}>{error ? 'Источник недоступен' : 'Автоматическое обновление'}</strong>
            <span>{updatedAt ? `Проверено в ${updatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'Подключение к таблице'}</span>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Обновление…' : 'Обновить'}
          </button>
        </div>
      </header>

      <section className="content">
        {error && <div className="error-banner" role="alert"><strong>Не удалось обновить данные.</strong><span>{error}</span></div>}

        <div className="period-row">
          <div><span className="section-kicker">Период</span><h2>{dashboard?.months[month] ?? 'Загрузка данных'}</h2></div>
          <div className="month-switcher" aria-label="Выбор месяца">
            {dashboard?.months.map((name, index) => (
              <button type="button" key={name} className={index === month ? 'active' : ''} onClick={() => setMonth(index)}>{name.slice(0, 3)}</button>
            ))}
          </div>
        </div>

        <section className="metric-grid" aria-label="Ключевые показатели">
          {dashboard ? dashboard.metrics.map((metric) => {
            const actual = metric.actual[month];
            const plan = metric.plan[month];
            const completion = metric.completion[month];
            const trend = metric.trend[month];
            const progress = asPercent(completion);
            const tone = completionTone(completion);
            return (
              <article className="metric-card" key={metric.id}>
                <div className="metric-heading"><h3>{metric.name}</h3><div className="trend-block"><span className={`trend ${trendTone(trend)}`}>{trendText(trend, metric.trendUnit)}</span><small>по сравнению с предыдущим месяцем</small></div></div>
                <div className={`metric-value ${tone}`}>{shown(actual, metric.unit)}</div>
                <div className="metric-caption">Факт за месяц</div>
                <div className="metric-plan-row"><span>План</span><strong>{shown(plan, metric.unit)}</strong></div>
                <div className="progress-track" aria-hidden="true"><span className={tone} style={{ width: `${Math.min(Math.max(progress ?? 0, 0), 100)}%` }} /></div>
                <div className="completion-row"><span>Выполнение плана</span><strong className={tone}>{completion.display}</strong></div>
              </article>
            );
          }) : definitions.map((metric) => <div className="metric-card skeleton" key={metric.id} />)}
        </section>

        <section className="chart-section" aria-labelledby="dynamics-title">
          <div className="chart-section-heading">
            <span className="section-kicker">Выполнение плана по месяцам</span>
            <h2 id="dynamics-title">Динамика</h2>
          </div>
          <div className="chart-panel">
            <div className="panel-heading">
              <div><span className="section-kicker">Отклонение от плана</span><h3>{chartMetric?.name ?? 'Показатель'}</h3></div>
              <div className="metric-switcher" aria-label="Выбор показателя">
                {dashboard?.metrics.map((metric) => <button key={metric.id} type="button" className={metric.id === metricId ? 'active' : ''} onClick={() => setMetricId(metric.id)}>{metric.shortName}</button>)}
              </div>
            </div>
            {deviationData.length ? (
              <div className="deviation-scroll">
                <div className="deviation-plot" style={{ minWidth: `${Math.max(deviationData.length * 118, 620)}px` }} aria-label={`Отклонение показателя ${chartMetric?.name ?? ''} от плана по месяцам`}>
                  <span className="scale-label scale-top">+{deviationScale}%</span>
                  <span className="scale-label scale-bottom">−{deviationScale}%</span>
                  <div className="plan-baseline"><span>План 100%</span></div>
                  <svg className="trend-line" viewBox="0 0 1000 260" preserveAspectRatio="none" aria-hidden="true">
                    <path d={smoothPath(trendPoints)} />
                    {trendPoints.map((point, index) => <circle key={deviationData[index].name} className={deviationData[index].tone} cx={point.x} cy={point.y} r="6" vectorEffect="non-scaling-stroke" />)}
                  </svg>
                  <div className="deviation-columns" style={{ gridTemplateColumns: `repeat(${deviationData.length}, minmax(80px, 1fr))` }}>
                    {deviationData.map((item) => {
                      const height = Math.min((Math.abs(item.deviation) / deviationScale) * 104, 104);
                      const pointTop = 130 - (item.deviation / deviationScale) * 104;
                      return (
                        <div className={`deviation-column ${item.index === month ? 'selected' : ''}`} key={item.name} aria-label={`${item.name}: отклонение от плана ${deviationText(item.deviation)}`}>
                          <strong className={`deviation-label ${item.deviation >= 0 ? 'above' : 'below'} ${item.tone}`} style={{ top: `${pointTop}px` }}>{deviationText(item.deviation)}</strong>
                          <span className={`deviation-bar ${item.deviation >= 0 ? 'up' : 'down'} ${item.tone}`} style={{ height: `${height}px` }} aria-hidden="true" />
                          <span className="deviation-month">{item.name.slice(0, 3)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="chart-empty"><strong>График пока недоступен</strong><span>Для показателя «{chartMetric?.name ?? 'Показатель'}» план не задан.</span></div>
            )}
          </div>
        </section>

        <footer><span>Источник: вкладка «Результат»</span><a href={SOURCE_URL} target="_blank" rel="noreferrer">Открыть исходную таблицу</a></footer>
      </section>
    </main>
  );
}
