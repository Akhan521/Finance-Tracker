import { useState } from 'react';
import Sheet from './Sheet';
import './ui.css';

export type Option<T extends string> = { value: T; label: string };
type Props<T extends string> = {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
};

// A row showing the current choice; tapping opens a sheet with the options.
export default function Picker<T extends string>({ label, value, options, onChange }: Props<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <button type="button" className="row row-button" onClick={() => setOpen(true)}>
        <span>{label}</span>
        <span className="row-value">{current?.label ?? ''}</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="group-rows">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className="row row-button"
              aria-pressed={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span>{o.label}</span>
              {o.value === value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
