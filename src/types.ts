export interface Settings {
  importFolderPath: string | null;
  scanRecursive: boolean;
  lastScanTimestamp: string | null;
  darkMode: boolean;
  accentTheme: string;
  heatmapFullOpacity: boolean;
  chartMaxSamples: number;
  heartRateZoneUpperBoundsBpm: number[];
}

export interface ActivityFilters {
  startDate?: string;
  endDate?: string;
  category?: string;
  sportType?: string;
  minDistance?: number;
  maxDistance?: number;
  day?: string;
}

export interface HeatmapFilters {
  startDate?: string;
  endDate?: string;
  category?: string;
  sportType?: string;
  activityIds?: number[];
  maxPoints?: number;
}

export interface ActivitySummary {
  id: number;
  sourcePath: string;
  activityStart: string;
  title: string;
  category: string;
  sportType: string;
  durationSeconds: number;
  movingDurationSeconds: number;
  distanceM: number;
  elevationGainM: number;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  avgHr: number | null;
  minHr: number | null;
  maxHr: number | null;
  hasGps: boolean;
}

export interface TrackPoint {
  lat: number;
  lon: number;
}

export interface ActivitySample {
  elapsedSeconds: number;
  distanceM: number | null;
  speedMps: number | null;
  heartRate: number | null;
  cadence: number | null;
  powerWatts: number | null;
  altitudeM: number | null;
  lat: number | null;
  lon: number | null;
  timestamp: string | null;
}

export interface ActivityDetail {
  summary: ActivitySummary;
  track: TrackPoint[];
  originalSampleCount: number;
}

export interface ActivitySampleQuery {
  distanceMinKm?: number;
  distanceMaxKm?: number;
  maxSamples?: number;
}

export interface ActivitySamplesResponse {
  samples: ActivitySample[];
  originalSampleCount: number;
  matchingSampleCount: number;
  returnedSampleCount: number;
}

export interface HeatmapData {
  tracks: TrackPoint[][];
  activityCount: number;
  originalPointCount: number;
  returnedPointCount: number;
}

export interface ScanProgressEvent {
  parsed: number;
  total: number;
  currentFile: string;
}

export interface ScanDoneEvent {
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}
