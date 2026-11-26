import { formatCents } from '../lib/money';
import { donutCenter, donutSlices, type EntryRow } from '../lib/totals';
import { deepen } from './deepen';
import { arcPath, layoutSlices } from './arcs';
import './home.css';

const C = 90; // center of the 180 x 180 box
const R = 62;
const STROKE = 14;
const GAP_DEG = 2;
// A round cap sticks out half the stroke width past the arc's end.
const CAP_DEG = ((STROKE / 2) / R) * (180 / Math.PI);

function amountSize(text: string): string {
  return text.length <= 6 ? 'donut-lg' : text.length <= 8 ? 'donut-md' : 'donut-sm';
}

type Props = {
  rows: EntryRow[];
  categories: Map<string, { name: string; color: string }>;
};

export default function DonutView({ rows, categories }: Props) {
  const slices = donutSlices(rows, categories);
  if (slices.length === 0) return <p className="page-quiet donut-empty">Nothing due this month.</p>;

  const { leftCents, totalCents } = donutCenter(slices);
  const sub = `left of ${formatCents(totalCents)}`;
  const layout = layoutSlices(
    slices.map((s) => ({ size: s.sizeCents, paid: s.paidCents })),
    { gapDeg: GAP_DEG, capDeg: CAP_DEG, minDeg: 2 * CAP_DEG + GAP_DEG + 3 },
  );

  return (
    <section className="donut" aria-label="Spending by category">
      <div className="donut-ring">
        <svg viewBox="0 0 180 180" aria-hidden="true" focusable="false">
          {slices.map((s, i) => {
            const l = layout[i];
            const common = { fill: 'none', strokeWidth: STROKE, strokeLinecap: 'round' as const };
            return (
              <g key={s.categoryId}>
                {l.owed && (
                  <path
                    {...common}
                    stroke={s.color}
                    data-part="owed"
                    data-category={s.categoryId}
                    d={arcPath(C, C, R, l.owed.from, l.owed.to)}
                  />
                )}
                {l.paid && (
                  <path
                    {...common}
                    stroke={deepen(s.color)}
                    data-part="paid"
                    data-category={s.categoryId}
                    d={arcPath(C, C, R, l.paid.from, l.paid.to)}
                  />
                )}
              </g>
            );
          })}
        </svg>
        <div className="donut-center">
          <b className={amountSize(formatCents(leftCents))}>{formatCents(leftCents)}</b>
          <span className={sub.length > 14 ? 'donut-sub-sm' : undefined}>{sub}</span>
        </div>
      </div>
      <ul className="donut-legend">
        {slices.map((s) => (
          <li key={s.categoryId}>
            <span className="donut-name">
              <i className="donut-dot" style={{ background: deepen(s.color) }} aria-hidden="true" />
              {s.name}
            </span>
            <span className="donut-amounts">
              {s.owedCents === 0 ? (
                <>{formatCents(s.sizeCents)} · paid</>
              ) : (
                <>
                  {s.overdueCents > 0 && (
                    <span className="donut-overdue">
                      <i className="donut-pill" aria-hidden="true" />
                      {formatCents(s.overdueCents)} overdue
                    </span>
                  )}
                  {s.overdueCents < s.owedCents && (
                    <span>
                      {formatCents(s.owedCents)} of {formatCents(s.sizeCents)} left
                    </span>
                  )}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
