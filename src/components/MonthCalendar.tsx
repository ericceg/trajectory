import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths
} from 'date-fns';

import type { ActivitySummary } from '@/types';

interface MonthCalendarProps {
  month: Date;
  activities: ActivitySummary[];
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
  onMonthChange: (month: Date) => void;
}

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MonthCalendar({
  month,
  activities,
  selectedDay,
  onSelectDay,
  onMonthChange
}: MonthCalendarProps) {
  const activityCountsByDay = activities.reduce<Record<string, number>>((acc, activity) => {
    const key = format(parseISO(activity.activityStart), 'yyyy-MM-dd');
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <section className="rounded-xl border border-border bg-panel p-4 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1 text-sm text-muted hover:text-foreground"
          onClick={() => onMonthChange(subMonths(month, 1))}
        >
          Prev
        </button>
        <h3 className="text-lg font-semibold text-foreground">{format(month, 'MMMM yyyy')}</h3>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1 text-sm text-muted hover:text-foreground"
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          Next
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2 text-center text-xs uppercase tracking-[0.12em] text-muted">
        {weekdays.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-2">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const count = activityCountsByDay[key] ?? 0;
          const inCurrentMonth = isSameMonth(day, month);
          const selected = selectedDay === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(selected ? null : key)}
              className={`rounded-lg border p-2 text-left transition-colors ${
                selected
                  ? 'border-accent bg-accent/20'
                  : count > 0
                    ? 'border-accent/40 bg-accent/10'
                    : 'border-border bg-bg/40 hover:bg-white/5'
              } ${inCurrentMonth ? 'text-foreground' : 'text-muted/40'}`}
            >
              <span className="block text-sm font-medium">{format(day, 'd')}</span>
              {count > 0 ? <span className="mt-1 block text-xs text-muted">{count} act.</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
