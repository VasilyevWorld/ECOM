'use client';

import { useSyncExternalStore } from 'react';
import DashboardClient from './dashboard-client';

const subscribe = () => () => undefined;

export default function ClientOnlyDashboard() {
  const isBrowser = useSyncExternalStore(subscribe, () => true, () => false);

  if (!isBrowser) {
    return <main className="dashboard-loading">Загрузка актуальных данных…</main>;
  }

  return <DashboardClient />;
}
