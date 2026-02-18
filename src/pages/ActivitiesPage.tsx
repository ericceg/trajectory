import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable
} from '@tanstack/react-table';

import { listActivities } from '@/lib/tauri';
import {
  formatDateTime,
  formatDistanceKm,
  formatDuration,
  formatPaceMinKm,
  formatSpeedKmh
} from '@/lib/format';
import type { ActivityFilters, ActivitySummary } from '@/types';

const columnHelper = createColumnHelper<ActivitySummary>();
const CATEGORY_OPTIONS = [
  'Running',
  'Biking',
  'Strength',
  'Walking',
  'Hiking',
  'Swimming',
  'Rowing',
  'Mobility',
  'Other'
];

export function ActivitiesPage() {
  const navigate = useNavigate();

  const [filters, setFilters] = useState<{
    category: string;
    minDistanceKm: string;
    maxDistanceKm: string;
  }>({
    category: '',
    minDistanceKm: '',
    maxDistanceKm: ''
  });

  const [data, setData] = useState<ActivitySummary[]>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'activityStart', desc: true }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo(
    () => [
      columnHelper.accessor('activityStart', {
        header: 'Date/Time',
        cell: (info) => formatDateTime(info.getValue())
      }),
      columnHelper.accessor('category', {
        header: 'Category'
      }),
      columnHelper.accessor('distanceM', {
        header: 'Distance',
        cell: (info) => formatDistanceKm(info.getValue())
      }),
      columnHelper.accessor('durationSeconds', {
        header: 'Duration',
        cell: (info) => formatDuration(info.getValue())
      }),
      columnHelper.accessor('avgSpeedMps', {
        header: 'Avg Speed',
        cell: (info) => formatSpeedKmh(info.getValue())
      }),
      columnHelper.accessor('avgSpeedMps', {
        id: 'avgPace',
        header: 'Avg Pace',
        cell: (info) => formatPaceMinKm(info.getValue())
      }),
      columnHelper.accessor('elevationGainM', {
        header: 'Elevation Gain',
        cell: (info) => `${Math.round(info.getValue())} m`
      }),
      columnHelper.accessor('avgHr', {
        header: 'Avg HR',
        cell: (info) => (info.getValue() ? `${Math.round(info.getValue() ?? 0)} bpm` : 'n/a')
      })
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const loadActivities = async () => {
    const query: ActivityFilters = {
      category: filters.category || undefined,
      minDistance: filters.minDistanceKm ? Number(filters.minDistanceKm) * 1000 : undefined,
      maxDistance: filters.maxDistanceKm ? Number(filters.maxDistanceKm) * 1000 : undefined
    };

    setLoading(true);
    setError(null);

    try {
      const activities = await listActivities(query);
      setData(activities);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadActivities();
  }, [filters]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Activities</p>
        <h2 className="mt-2 text-3xl font-semibold text-foreground">All Workouts</h2>
      </header>

      <section className="rounded-xl border border-border bg-panel p-4 shadow-card">
        <div className="grid gap-3 md:grid-cols-3">
          <select
            value={filters.category}
            onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm"
          >
            <option value="">All categories</option>
            {CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="0.1"
            placeholder="Min distance (km)"
            value={filters.minDistanceKm}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, minDistanceKm: event.target.value }))
            }
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm"
          />
          <input
            type="number"
            min="0"
            step="0.1"
            placeholder="Max distance (km)"
            value={filters.maxDistanceKm}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, maxDistanceKm: event.target.value }))
            }
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm"
          />
        </div>
      </section>

      {error ? <p className="rounded-lg bg-accent/20 p-3 text-sm text-accent">{error}</p> : null}

      <section className="overflow-hidden rounded-xl border border-border bg-panel shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-bg/60 text-xs uppercase tracking-[0.12em] text-muted">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="cursor-pointer px-4 py-3"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t border-border hover:bg-white/5"
                  onClick={() => navigate(`/activities/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-muted">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading ? <p className="p-4 text-sm text-muted">Loading activities...</p> : null}
        {!loading && data.length === 0 ? <p className="p-4 text-sm text-muted">No activities found.</p> : null}
      </section>
    </div>
  );
}
