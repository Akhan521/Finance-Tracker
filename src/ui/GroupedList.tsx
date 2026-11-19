import type { ReactNode } from 'react';
import './ui.css';

type Props = { label?: string; children: ReactNode };

// A rounded group of rows, Settings style. Children are the rows.
export default function GroupedList({ label, children }: Props) {
  return (
    <section className="group">
      {label && <h2 className="group-label">{label}</h2>}
      <div className="group-rows">{children}</div>
    </section>
  );
}
