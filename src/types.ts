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

export type AdvancedAnalyticsGranularity = 'day' | 'week' | 'month';
export type AdvancedAnalyticsChartType = 'bar' | 'line' | 'stackedBar';
export type AdvancedAnalyticsMetricKind = 'base' | 'formula';
export type AdvancedAnalyticsBaseMeasure =
  | 'activitiesCount'
  | 'activeDaysCount'
  | 'distanceSum'
  | 'durationSum'
  | 'movingTimeSum'
  | 'elevationGainSum'
  | 'sampleTime';
export type AdvancedAnalyticsFormulaOperator = 'add' | 'subtract' | 'divide' | 'percent';
export type AdvancedAnalyticsPeriod = 'day' | 'week';
export type AdvancedAnalyticsThresholdOperator =
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'equals';

export type AdvancedAnalyticsActivityConditionField =
  | 'title'
  | 'category'
  | 'sportType'
  | 'distanceM'
  | 'durationSeconds'
  | 'movingDurationSeconds'
  | 'elevationGainM'
  | 'avgHr'
  | 'maxHr'
  | 'hasGps'
  | 'weekday';

export type AdvancedAnalyticsActivityConditionOperator =
  | 'contains'
  | 'containsAny'
  | 'containsAll'
  | 'equals'
  | 'startsWith'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'numberEquals'
  | 'notEquals'
  | 'is'
  | 'isNot';

export interface AdvancedAnalyticsActivityCondition {
  id: string;
  field: AdvancedAnalyticsActivityConditionField;
  operator: AdvancedAnalyticsActivityConditionOperator;
  value?: string;
  values?: string[];
  numberValue?: number;
  boolValue?: boolean;
}

export type AdvancedAnalyticsSampleConditionField =
  | 'heartRate'
  | 'heartRateZone'
  | 'powerWatts'
  | 'cadence'
  | 'speedMps';

export type AdvancedAnalyticsSampleConditionOperator =
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'numberEquals'
  | 'notEquals'
  | 'is';

export interface AdvancedAnalyticsSampleCondition {
  id: string;
  field: AdvancedAnalyticsSampleConditionField;
  operator: AdvancedAnalyticsSampleConditionOperator;
  numberValue?: number;
  zone?: number;
}

export interface AdvancedAnalyticsBaseMetricDefinition {
  measure: AdvancedAnalyticsBaseMeasure;
  activityConditions: AdvancedAnalyticsActivityCondition[];
  sampleConditions: AdvancedAnalyticsSampleCondition[];
  defaultChartGranularity?: AdvancedAnalyticsGranularity;
  displayUnit?: string;
}

export interface AdvancedAnalyticsFormulaMetricDefinition {
  leftMetricId: string;
  operator: AdvancedAnalyticsFormulaOperator;
  rightMetricId: string;
  displayUnit?: string;
}

export interface AdvancedAnalyticsMetricDefinition {
  id: string;
  name: string;
  kind: AdvancedAnalyticsMetricKind;
  showInView?: boolean;
  base?: AdvancedAnalyticsBaseMetricDefinition;
  formula?: AdvancedAnalyticsFormulaMetricDefinition;
}

export interface AdvancedAnalyticsStreakDefinition {
  id: string;
  name: string;
  metricId: string;
  period: AdvancedAnalyticsPeriod;
  thresholdOperator: AdvancedAnalyticsThresholdOperator;
  thresholdValue: number;
}

export interface AdvancedAnalyticsChartDefinition {
  id: string;
  name: string;
  chartType: AdvancedAnalyticsChartType;
  metricIds: string[];
  granularity: AdvancedAnalyticsGranularity;
}

export interface AdvancedAnalyticsRunRequest {
  startDate?: string;
  endDate?: string;
  metrics: AdvancedAnalyticsMetricDefinition[];
  streaks: AdvancedAnalyticsStreakDefinition[];
  charts: AdvancedAnalyticsChartDefinition[];
}

export interface AdvancedAnalyticsBucketPoint {
  key: string;
  label: string;
  value: number | null;
}

export interface AdvancedAnalyticsSeriesByGranularity {
  day: AdvancedAnalyticsBucketPoint[];
  week: AdvancedAnalyticsBucketPoint[];
  month: AdvancedAnalyticsBucketPoint[];
}

export interface AdvancedAnalyticsMetricResult {
  metricId: string;
  name: string;
  scalarValue: number | null;
  unit: string | null;
  seriesByGranularity: AdvancedAnalyticsSeriesByGranularity;
  errors: string[];
  warnings: string[];
}

export type AdvancedAnalyticsStreakStatus = 'active' | 'pending' | 'broken';

export interface AdvancedAnalyticsStreakResult {
  streakId: string;
  name: string;
  count: number;
  status: AdvancedAnalyticsStreakStatus;
  currentPeriodKey: string;
  currentPeriodValue: number;
  errors: string[];
  warnings: string[];
}

export interface AdvancedAnalyticsChartBucketPoint {
  key: string;
  label: string;
  values: Record<string, number | null>;
}

export interface AdvancedAnalyticsChartResult {
  chartId: string;
  name: string;
  chartType: AdvancedAnalyticsChartType;
  granularity: AdvancedAnalyticsGranularity;
  metricIds: string[];
  points: AdvancedAnalyticsChartBucketPoint[];
  errors: string[];
  warnings: string[];
}

export interface AdvancedAnalyticsRunResponse {
  metricResults: Record<string, AdvancedAnalyticsMetricResult>;
  streakResults: Record<string, AdvancedAnalyticsStreakResult>;
  chartResults: Record<string, AdvancedAnalyticsChartResult>;
  globalWarnings: string[];
}
