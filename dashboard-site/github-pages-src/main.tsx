import { StrictMode } from 'react';
// Отдельная клиентская сборка не требует серверной среды.
import { createRoot } from 'react-dom/client';
import DashboardClient from '../app/dashboard-client';
import '../app/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DashboardClient />
  </StrictMode>,
);
