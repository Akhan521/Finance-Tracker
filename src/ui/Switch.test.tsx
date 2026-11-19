import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import Switch from './Switch';

afterEach(cleanup);

function Demo() {
  const [on, setOn] = useState(false);
  return <Switch checked={on} onChange={setOn} label="Email reminders" />;
}

describe('Switch', () => {
  test('toggles and reports aria-checked', async () => {
    render(<Demo />);
    const sw = screen.getByRole('switch', { name: 'Email reminders' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await userEvent.setup().click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    await userEvent.setup().click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });
});
