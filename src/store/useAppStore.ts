import { create } from 'zustand';

import {
  getSettings,
  scanImportFolder,
  setDarkMode,
  setImportFolder,
  onScanProgress
} from '@/lib/tauri';
import type { ActivitySummary, ScanDoneEvent, ScanProgressEvent, Settings } from '@/types';

interface AppState {
  settings: Settings | null;
  loadingSettings: boolean;
  scanning: boolean;
  scanProgress: ScanProgressEvent | null;
  scanDone: ScanDoneEvent | null;
  activitiesCache: Record<string, ActivitySummary[]>;
  init: () => Promise<void>;
  updateImportFolder: (path: string, recursive: boolean) => Promise<void>;
  setScanRecursive: (recursive: boolean) => Promise<void>;
  updateDarkMode: (darkMode: boolean) => Promise<void>;
  runScan: (fullRescan?: boolean) => Promise<void>;
  getCachedActivities: (cacheKey: string) => ActivitySummary[] | null;
  setCachedActivities: (cacheKey: string, activities: ActivitySummary[]) => void;
  clearActivitiesCache: () => void;
}

let listenersInitialized = false;

export const useAppStore = create<AppState>((set, get) => ({
  settings: null,
  loadingSettings: true,
  scanning: false,
  scanProgress: null,
  scanDone: null,
  activitiesCache: {},
  init: async () => {
    if (!listenersInitialized) {
      listenersInitialized = true;
      void onScanProgress((progress) => {
        set({ scanProgress: progress, scanning: true });
      });
    }

    set({ loadingSettings: true });
    const settings = await getSettings();
    set({ settings, loadingSettings: false });
  },
  updateImportFolder: async (path, recursive) => {
    const settings = await setImportFolder(path, recursive);
    set({ settings, scanDone: null, activitiesCache: {} });
  },
  setScanRecursive: async (recursive) => {
    const current = get().settings;
    if (!current?.importFolderPath) {
      return;
    }

    const settings = await setImportFolder(current.importFolderPath, recursive);
    set({ settings, scanDone: null, activitiesCache: {} });
  },
  updateDarkMode: async (darkMode) => {
    const settings = await setDarkMode(darkMode);
    set({ settings });
  },
  runScan: async (fullRescan = false) => {
    set({ scanning: true, scanDone: null });
    try {
      const done = await scanImportFolder(fullRescan);
      const settings = await getSettings();
      set({ scanDone: done, scanning: false, scanProgress: null, settings, activitiesCache: {} });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({
        scanning: false,
        scanProgress: null,
        scanDone: { added: 0, updated: 0, skipped: 0, errors: [message] }
      });
      throw error;
    }
  },
  getCachedActivities: (cacheKey) => get().activitiesCache[cacheKey] ?? null,
  setCachedActivities: (cacheKey, activities) =>
    set((state) => ({
      activitiesCache: {
        ...state.activitiesCache,
        [cacheKey]: activities
      }
    })),
  clearActivitiesCache: () => set({ activitiesCache: {} })
}));
