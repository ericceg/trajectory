import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

import { ScanStatusCard } from '@/components/ScanStatusCard';
import { useAppStore } from '@/store/useAppStore';
import { useUiStateStore } from '@/store/useUiStateStore';

export function SettingsPage() {
  const settings = useAppStore((state) => state.settings);
  const scanning = useAppStore((state) => state.scanning);
  const scanProgress = useAppStore((state) => state.scanProgress);
  const scanDone = useAppStore((state) => state.scanDone);
  const updateImportFolder = useAppStore((state) => state.updateImportFolder);
  const setScanRecursive = useAppStore((state) => state.setScanRecursive);
  const updateDarkMode = useAppStore((state) => state.updateDarkMode);
  const updateHeatmapFullOpacity = useAppStore((state) => state.updateHeatmapFullOpacity);
  const runScan = useAppStore((state) => state.runScan);
  const activeTab = useUiStateStore((state) => state.settingsActiveTab);
  const setSettingsActiveTab = useUiStateStore((state) => state.setSettingsActiveTab);

  const [error, setError] = useState<string | null>(null);
  const [confirmFullRescan, setConfirmFullRescan] = useState(false);

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
    setConfirmFullRescan(false);
    setError(null);
    try {
      await runScan();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConfirmFullRescan = async () => {
    setError(null);
    try {
      await runScan(true);
      setConfirmFullRescan(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Settings</p>
        <h2 className="mt-2 text-3xl font-semibold text-foreground">
          {activeTab === 'import' ? 'Import Configuration' : 'Appearance'}
        </h2>
      </header>

      <section className="rounded-xl border border-border bg-panel p-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSettingsActiveTab('import')}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'import'
                ? 'bg-accent text-white'
                : 'text-muted hover:bg-bg hover:text-foreground'
            }`}
          >
            Import
          </button>
          <button
            type="button"
            onClick={() => setSettingsActiveTab('appearance')}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'appearance'
                ? 'bg-accent text-white'
                : 'text-muted hover:bg-bg hover:text-foreground'
            }`}
          >
            Appearance
          </button>
        </div>
      </section>

      {error ? <p className="rounded-lg bg-accent/20 p-3 text-sm text-accent">{error}</p> : null}

      {activeTab === 'import' ? (
        <>
          <section className="rounded-xl border border-border bg-panel p-5">
            <h3 className="text-lg font-semibold text-foreground">Import Folder</h3>
            <p className="mt-2 text-sm text-muted">
              Current folder: {settings?.importFolderPath ?? 'Not set'}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleChooseFolder()}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white"
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

              <button
                type="button"
                onClick={() => setConfirmFullRescan(true)}
                disabled={!settings?.importFolderPath || scanning}
                className="rounded-md border border-accent/50 bg-accent/10 px-4 py-2 text-sm font-medium text-accent disabled:opacity-50"
              >
                {scanning ? 'Scanning...' : 'Clear Cache + Full Rescan'}
              </button>
            </div>

            {confirmFullRescan ? (
              <div className="mt-3 rounded-md border border-accent/30 bg-accent/10 p-3">
                <p className="text-sm text-foreground">
                  This will clear all cached activities, then rebuild from files in your import
                  folder.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmFullRescan(false)}
                    className="rounded-md border border-border px-3 py-1.5 text-sm text-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmFullRescan()}
                    disabled={scanning}
                    className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Confirm Full Rescan
                  </button>
                </div>
              </div>
            ) : null}

            <p className="mt-3 text-xs text-muted">
              Full rescan clears cached activities first, then re-imports every TCX/FIT file. Use
              this if deleted or previously broken files are still visible.
            </p>

            {settings?.lastScanTimestamp ? (
              <p className="mt-3 text-xs text-muted">Last scan: {settings.lastScanTimestamp}</p>
            ) : null}
          </section>

          <ScanStatusCard scanning={scanning} progress={scanProgress} done={scanDone} />

          {scanDone?.errors.length ? (
            <section className="rounded-xl border border-border bg-panel p-4">
              <h3 className="text-lg font-semibold text-foreground">Scan Errors</h3>
              <ul className="mt-3 space-y-2 text-xs text-accent">
                {scanDone.errors.map((entry) => (
                  <li key={entry} className="rounded-md border border-accent/30 bg-accent/10 p-2">
                    {entry}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <section className="rounded-xl border border-border bg-panel p-5">
          <h3 className="text-lg font-semibold text-foreground">Theme</h3>
          <div className="mt-4 space-y-4">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={settings?.darkMode ?? false}
                onChange={(event) => void updateDarkMode(event.target.checked)}
                className="h-4 w-4 rounded border-border bg-bg"
              />
              Dark mode
            </label>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <h3 className="text-lg font-semibold text-foreground">Heatmap</h3>
            <p className="mt-2 text-sm text-muted">
              Control how route overlays render on the Heatmap page.
            </p>
            <label className="mt-4 flex items-start gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={settings?.heatmapFullOpacity ?? false}
                onChange={(event) => void updateHeatmapFullOpacity(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border bg-bg"
              />
              <span>
                Use 100% opacity for heatmap routes
                <span className="mt-1 block text-xs text-muted">
                  Disables the adaptive transparent styling and renders route lines fully opaque.
                </span>
              </span>
            </label>
          </div>
        </section>
      )}
    </div>
  );
}
