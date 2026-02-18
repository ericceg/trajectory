import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import {
  type ActivityDetail,
  type ActivityFilters,
  type ActivitySummary,
  type ScanDoneEvent,
  type ScanProgressEvent,
  type Settings,
  type StatsRange,
  type StatsResponse
} from '@/types';

export const getSettings = () => invoke<Settings>('get_settings');

export const setImportFolder = (path: string, recursive: boolean) =>
  invoke<Settings>('set_import_folder', { path, recursive });

export const scanImportFolder = () => invoke<ScanDoneEvent>('scan_import_folder');

export const listActivities = (filters?: ActivityFilters) =>
  invoke<ActivitySummary[]>('list_activities', { filters });

export const getActivity = (id: number) => invoke<ActivityDetail>('get_activity', { id });

export const getStats = (range: StatsRange) => invoke<StatsResponse>('get_stats', { range });

export const onScanProgress = (handler: (event: ScanProgressEvent) => void): Promise<UnlistenFn> =>
  listen<ScanProgressEvent>('scan:progress', (event) => handler(event.payload));

export const onScanDone = (handler: (event: ScanDoneEvent) => void): Promise<UnlistenFn> =>
  listen<ScanDoneEvent>('scan:done', (event) => handler(event.payload));
