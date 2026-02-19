import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { Sidebar } from '@/components/Sidebar';
import { useAppStore } from '@/store/useAppStore';
import { DashboardPage } from '@/pages/DashboardPage';
import { ActivitiesPage } from '@/pages/ActivitiesPage';
import { ActivityDetailPage } from '@/pages/ActivityDetailPage';
import { StatisticsPage } from '@/pages/StatisticsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { OnboardingPage } from '@/pages/OnboardingPage';

let startupScanTriggered = false;

function AppLayout() {
  return (
    <div className="flex min-h-screen bg-bg text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/activities" element={<ActivitiesPage />} />
          <Route path="/activities/:id" element={<ActivityDetailPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const init = useAppStore((state) => state.init);
  const settings = useAppStore((state) => state.settings);
  const loadingSettings = useAppStore((state) => state.loadingSettings);
  const runScan = useAppStore((state) => state.runScan);
  const scanning = useAppStore((state) => state.scanning);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings?.darkMode ? 'dark' : 'light';
  }, [settings?.darkMode]);

  useEffect(() => {
    if (loadingSettings || !settings?.importFolderPath || startupScanTriggered || scanning) {
      return;
    }

    startupScanTriggered = true;
    void runScan().catch((error) => {
      console.error('Automatic startup scan failed', error);
    });
  }, [loadingSettings, runScan, scanning, settings?.importFolderPath]);

  if (loadingSettings) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg text-sm text-muted">
        Loading settings...
      </main>
    );
  }

  if (!settings?.importFolderPath) {
    return <OnboardingPage />;
  }

  return (
    <HashRouter>
      <AppLayout />
    </HashRouter>
  );
}
