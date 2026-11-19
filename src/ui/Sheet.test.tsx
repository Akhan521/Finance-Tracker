import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import Sheet from './Sheet';

afterEach(cleanup);

describe('Sheet', () => {
  test('renders nothing when closed', () => {
    render(<Sheet open={false} onClose={() => {}} title="Pick"><p>hi</p></Sheet>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('moves focus in and closes on Escape', async () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="Pick"><button>One</button></Sheet>);
    const dialog = screen.getByRole('dialog', { name: 'Pick' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.setup().keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
