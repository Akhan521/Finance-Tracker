import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { todayIn } from '../lib/calendar';
import { errorMessage } from '../lib/errors';
import {
  useCategories,
  useHasBills,
  useMonthEntries,
  useMyHousehold,
  useProfile,
  useSetLastView,
  type View,
} from '../lib/queries';
import CalendarView from './CalendarView';
import DayList from './DayList';
import DonutView from './DonutView';
import { MONTH_NAMES } from './months';
import Totals from './Totals';
import '../Pages.css';
import './home.css';

type Mode = 'calendar' | 'donut';

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; text: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-label={o.label}
          aria-pressed={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

export default function Home({ userId }: { userId: string }) {
  const profile = useProfile(userId).data;
  const household = useMyHousehold(userId).data?.households ?? null;
  const setLastView = useSetLastView(userId);

  const [picked, setView] = useState<View>(profile?.last_view === 'mine' ? 'mine' : 'household');
  const view: View = household ? picked : 'mine';
  const zone = (view === 'household' ? household?.time_zone : profile?.time_zone) ?? 'UTC';
  const today = todayIn(zone);

  const [ym, setYm] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const [mode, setMode] = useState<Mode>('calendar');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const entries = useMonthEntries(userId, view, ym.year, ym.month);
  const hasBills = useHasBills(userId, view);
  const categories = useCategories(userId, view);
  const categoryMap = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, { name: c.name, color: c.color }])),
    [categories.data],
  );

  function step(delta: number) {
    setSelectedDay(null);
    setYm(({ year, month }) => {
      const i = year * 12 + (month - 1) + delta;
      return { year: Math.floor(i / 12), month: (i % 12) + 1 };
    });
  }

  function chooseView(next: View) {
    if (next === view) return;
    setSelectedDay(null);
    setView(next);
    setLastView.mutate(next);
  }

  const currentYear = Number(today.slice(0, 4));
  // The year appears only when it isn't the current one, to keep the bar quiet.
  const label = MONTH_NAMES[ym.month - 1] + (ym.year === currentYear ? '' : ` ${ym.year}`);
  const rows = entries.data ?? [];

  return (
    <main className="page">
      <header className="topbar home-bar">
        <div className="month">
          <button type="button" aria-label="Previous month" onClick={() => step(-1)}>
            ‹
          </button>
          <h1>{label}</h1>
          <button type="button" aria-label="Next month" onClick={() => step(1)}>
            ›
          </button>
        </div>
        <nav className="topbar-actions">
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'calendar', label: 'Calendar view', text: '▦' },
              { value: 'donut', label: 'Chart view', text: '◔' },
            ]}
          />
          <Link to="/bills/new" aria-label="Add a bill" className="icon-link small">
            +
          </Link>
          <Link to="/settings" aria-label="Settings" className="icon-link small">
            ⚙
          </Link>
        </nav>
      </header>

      {household && (
        <div className="who">
          <Segmented<View>
            value={view}
            onChange={chooseView}
            options={[
              { value: 'household', label: 'Household', text: 'Household' },
              { value: 'mine', label: 'Mine', text: 'Mine' },
            ]}
          />
        </div>
      )}

      {hasBills.data === false ? (
        <section className="empty">
          <p className="empty-line">No bills yet.</p>
          <Link to="/bills/new" className="empty-action">
            Add your first bill
          </Link>
        </section>
      ) : mode === 'calendar' ? (
        <>
          {entries.isError && !entries.data && <p role="alert" className="page-quiet">{errorMessage(entries.error)}</p>}
          <CalendarView
            year={ym.year}
            month={ym.month}
            today={today}
            entries={rows}
            selectedDay={selectedDay}
            loading={!entries.data}
            onSelectDay={setSelectedDay}
          />
          {entries.data && <Totals entries={rows} />}
          {selectedDay && (
            <DayList userId={userId} day={selectedDay} entries={rows} onClose={() => setSelectedDay(null)} />
          )}
        </>
      ) : (
        // Say nothing until the month and its categories have loaded once: no false $0.
        categories.isError ? (
          <p role="alert" className="page-quiet">Couldn't load categories.</p>
        ) : (
          entries.data && categories.data && <DonutView rows={rows} categories={categoryMap} />
        )
      )}
    </main>
  );
}
