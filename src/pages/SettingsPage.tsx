import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

import { ScanStatusCard } from '@/components/ScanStatusCard';
import { useAppStore } from '@/store/useAppStore';

export function SettingsPage() {
  const settings = useAppStore((state) => state.settings);
  const scanning = useAppStore((state) => state.scanning);
  const scanProgress = useAppStore((state) => state.scanProgress);
  const scanDone = useAppStore((state) => state.scanDone);
  const updateImportFolder = useAppStore((state) => state.updateImportFolder);
  const setScanRecursive = useAppStore((state) => state.setScanRecursive);
  const runScan = useAppStore((state) => state.runScan);

  const [error, setError] = useState<string | null>(null);

  const handleChooseFolder = async () => {
    const path = await open({ directory: true, multiple: false, title: 'Select Import Folder' });
    if (!path || Array.isArray(path)) {
      return;
    }

    setError(null);
    try {
      await updateImportFolder(path, settings?.scanRecursive ?? true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRescan = async () => {
    setError(null);
    try {
      await runScan();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Settings</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">Import Configuration</h2>
      </header>

      {error ? <p className="rounded-lg bg-accent/20 p-3 text-sm text-accent">{error}</p> : null}

      <section className="rounded-xl border border-border bg-panel p-5 shadow-card">
        <h3 className="text-lg font-semibold text-white">Import Folder</h3>
        <p className="mt-2 text-sm text-muted">
          Current folder: {settings?.importFolderPath ?? 'Not set'}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleChooseFolder()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold"
          >
            Choose Folder
          </button>

          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={settings?.scanRecursive ?? true}
              onChange={(event) => void setScanRecursive(event.target.checked)}
              className="h-4 w-4 rounded border-border bg-bg"
            />
            Scan recursively
          </label>

          <button
            type="button"
            onClick={() => void handleRescan()}
            disabled={!settings?.importFolderPath || scanning}
            className="rounded-md border border-border px-4 py-2 text-sm text-muted disabled:opacity-50"
          >
            {scanning ? 'Scanning...' : 'Rescan'}
          </button>
        </div>

        {settings?.lastScanTimestamp ? (
          <p className="mt-3 text-xs text-muted">Last scan: {settings.lastScanTimestamp}</p>
        ) : null}
      </section>

      <ScanStatusCard scanning={scanning} progress={scanProgress} done={scanDone} />

      {scanDone?.errors.length ? (
        <section className="rounded-xl border border-border bg-panel p-4 shadow-card">
          <h3 className="text-lg font-semibold text-white">Scan Errors</h3>
          <ul className="mt-3 space-y-2 text-xs text-accent">
            {scanDone.errors.map((entry) => (
              <li key={entry} className="rounded-md border border-accent/30 bg-accent/10 p-2">
                {entry}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
