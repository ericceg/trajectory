import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import type { AccentThemeId } from '@/lib/theme';
import {
  type ActivityDetail,
  type ActivityFilters,
  type ActivitySampleQuery,
  type ActivitySamplesResponse,
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

export const setAccentTheme = (accentTheme: AccentThemeId) =>
  invoke<Settings>('set_accent_theme', { accentTheme });

export const setHeatmapFullOpacity = (heatmapFullOpacity: boolean) =>
  invoke<Settings>('set_heatmap_full_opacity', { heatmapFullOpacity });

export const setChartMaxSamples = (chartMaxSamples: number) =>
  invoke<Settings>('set_chart_max_samples', { chartMaxSamples });

export const scanImportFolder = (fullRescan = false) =>
  invoke<ScanDoneEvent>('scan_import_folder', { fullRescan });

export const listActivities = (filters?: ActivityFilters) =>
  invoke<ActivitySummary[]>('list_activities', { filters });

export const getActivity = (id: number) => invoke<ActivityDetail>('get_activity', { id });

export const getActivitySamples = (id: number, query?: ActivitySampleQuery) =>
  invoke<ActivitySamplesResponse>('get_activity_samples', { id, query });

export const getHeatmapData = (filters?: HeatmapFilters) =>
  invoke<HeatmapData>('get_heatmap_data', { filters });

export const writeGpxFile = (path: string, contents: string) =>
  invoke<string>('write_gpx_file', { path, contents });

export const onScanProgress = (handler: (event: ScanProgressEvent) => void): Promise<UnlistenFn> =>
  listen<ScanProgressEvent>('scan:progress', (event) => handler(event.payload));
