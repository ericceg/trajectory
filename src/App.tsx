import { Suspense, lazy, useEffect, useRef } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { Sidebar } from '@/components/Sidebar';
import { useAppStore } from '@/store/useAppStore';

const DashboardPage = lazy(async () => ({
  default: (await import('@/pages/DashboardPage')).DashboardPage
}));
const ActivitiesPage = lazy(async () => ({
  default: (await import('@/pages/ActivitiesPage')).ActivitiesPage
}));
const ActivityDetailPage = lazy(async () => ({
  default: (await import('@/pages/ActivityDetailPage')).ActivityDetailPage
}));
const StatisticsPage = lazy(async () => ({
  default: (await import('@/pages/StatisticsPage')).StatisticsPage
}));
const SettingsPage = lazy(async () => ({
  default: (await import('@/pages/SettingsPage')).SettingsPage
}));
const OnboardingPage = lazy(async () => ({
  default: (await import('@/pages/OnboardingPage')).OnboardingPage
}));

function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg text-sm text-muted">
      {message}
    </main>
  );
}

function AppLayout() {
  return (
    <div className="flex min-h-screen bg-bg text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense fallback={<LoadingScreen message="Loading page..." />}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/activities" element={<ActivitiesPage />} />
            <Route path="/activities/:id" element={<ActivityDetailPage />} />
            <Route path="/statistics" element={<StatisticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
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
  const startupScanPath = useRef<string | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings?.darkMode ? 'dark' : 'light';
  }, [settings?.darkMode]);

  useEffect(() => {
    const importFolderPath = settings?.importFolderPath;

    if (loadingSettings || !importFolderPath || scanning) {
      return;
    }

    if (startupScanPath.current === importFolderPath) {
      return;
    }

    startupScanPath.current = importFolderPath;
    void runScan().catch((error) => {
      startupScanPath.current = null;
      console.error('Automatic startup scan failed', error);
    });
  }, [loadingSettings, runScan, scanning, settings?.importFolderPath]);

  if (loadingSettings) {
    return <LoadingScreen message="Loading settings..." />;
  }

  if (!settings?.importFolderPath) {
    return (
      <Suspense fallback={<LoadingScreen message="Loading onboarding..." />}>
        <OnboardingPage />
      </Suspense>
    );
  }

  return (
    <HashRouter>
      <AppLayout />
    </HashRouter>
  );
}
