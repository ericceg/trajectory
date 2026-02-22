import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import {
  type ActivityDetail,
  type ActivityFilters,
  type ActivitySummary,
  type HeatmapData,
  type HeatmapFilters,
  type ScanDoneEvent,
  type ScanProgressEvent,
  type Settings
} from '@/types';

export const getSettings = () => invoke<Settings>('get_settings');

export const setImportFolder = (path: string, recursive: boolean) =>
  invoke<Settings>('set_import_folder', { path, recursive });

export const setDarkMode = (darkMode: boolean) =>
  invoke<Settings>('set_dark_mode', { darkMode });

export const setHeatmapFullOpacity = (heatmapFullOpacity: boolean) =>
  invoke<Settings>('set_heatmap_full_opacity', { heatmapFullOpacity });

export const scanImportFolder = (fullRescan = false) =>
  invoke<ScanDoneEvent>('scan_import_folder', { fullRescan });

export const listActivities = (filters?: ActivityFilters) =>
  invoke<ActivitySummary[]>('list_activities', { filters });

export const getActivity = (id: number) => invoke<ActivityDetail>('get_activity', { id });

export const getHeatmapData = (filters?: HeatmapFilters) =>
  invoke<HeatmapData>('get_heatmap_data', { filters });

export const onScanProgress = (handler: (event: ScanProgressEvent) => void): Promise<UnlistenFn> =>
  listen<ScanProgressEvent>('scan:progress', (event) => handler(event.payload));
