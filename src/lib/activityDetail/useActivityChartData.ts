import { useMemo } from 'react';
import { activityChartSamples } from '@/lib/activityDetail/activityData';
import { deriveSelectedActivity } from '@/lib/activityDetail/activityMetrics';
import type { ActivityDetail, ActivityRange, ActivitySample } from '@/types';

export function useActivityChartData(
  detail: ActivityDetail | null, records: ActivitySample[], axis: ActivityRange['axis'],
  zoomDomain: [number, number] | null, hidePauses: boolean, maxSamples: number,
  heartRateZoneUpperBoundsBpm: number[]
) {
  // Only the committed zoom drives full-resolution work. The live drag domain
  // belongs to the selection highlight and must not invalidate these memos.
  const zoomMin = zoomDomain?.[0];
  const zoomMax = zoomDomain?.[1];
  const selection = useMemo<ActivityRange | null>(() => zoomMin != null && zoomMax != null
    ? { axis, min: zoomMin, max: zoomMax } : null, [axis, zoomMin, zoomMax]);
  const selectedActivity = useMemo(() => detail
    ? deriveSelectedActivity(detail, records, selection, heartRateZoneUpperBoundsBpm) : null,
    [detail, records, selection, heartRateZoneUpperBoundsBpm]);
  const chartSamples = useMemo(() => {
    if (!detail || !selectedActivity?.elapsedRange) return [];
    return activityChartSamples(detail, records, selection ? selectedActivity.elapsedRange : null, hidePauses, maxSamples)
      .filter((record) => axis !== 'distance' || record.distanceM != null);
  }, [detail, records, selection, selectedActivity, axis, hidePauses, maxSamples]);
  return { selectedActivity, chartSamples };
}
