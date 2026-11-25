import { monthGrid } from '../lib/calendar';
import { dayStatus, type EntryRow, type Status } from '../lib/totals';
import { MONTH_NAMES } from './months';
import './home.css';

type Props = {
  year: number;
  month: number; // 1-based
  today: string; // ISO date in the scope's time zone
  entries: EntryRow[];
  onSelectDay: (date: string) => void;
  selectedDay?: string | null;
  loading?: boolean; // first load: say nothing about the month yet
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function CalendarView({ year, month, today, entries, onSelectDay, selectedDay, loading }: Props) {
  const byDay = new Map<string, Status[]>();
  for (const e of entries) byDay.set(e.dueDate, [...(byDay.get(e.dueDate) ?? []), e.status]);

  return (
    <section aria-label={`${MONTH_NAMES[month - 1]} ${year}`}>
      <div className="cal">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="cal-head" aria-hidden="true">
            {w}
          </div>
        ))}
        {monthGrid(year, month).flat().map((date, i) => {
          if (!date) return <div key={i} className="cal-blank" />;
          const n = Number(date.slice(8));
          const isToday = date === today;
          const status = dayStatus(byDay.get(date) ?? []);
          const cls = ['day', status && `status-${status}`, isToday && 'day-today', date === selectedDay && 'day-selected']
            .filter(Boolean)
            .join(' ');
          if (!status) {
            return (
              <div key={i} className={cls} aria-current={isToday ? 'date' : undefined}>
                {n}
              </div>
            );
          }
          return (
            <button
              key={i}
              type="button"
              className={cls}
              aria-label={`${MONTH_NAMES[month - 1]} ${n}, ${status}`}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => onSelectDay(date)}
            >
              {n}
            </button>
          );
        })}
      </div>
      {!loading && entries.length === 0 && <p className="nothing-due">Nothing due this month.</p>}
    </section>
  );
}
