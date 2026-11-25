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

  test('Tab and Shift+Tab cycle within the sheet', async () => {
    render(
      <div>
        <button>Outside</button>
        <Sheet open onClose={() => {}} title="Pick">
          <button>One</button>
          <input aria-label="Two" />
          <a href="/x">Three</a>
        </Sheet>
      </div>,
    );
    const u = userEvent.setup();
    const one = screen.getByRole('button', { name: 'One' });
    const three = screen.getByRole('link', { name: 'Three' });
    three.focus();
    await u.tab();
    expect(document.activeElement).toBe(one);
    await u.tab({ shift: true });
    expect(document.activeElement).toBe(three);
    // From the dialog itself: Shift+Tab goes to the last, Tab to the first.
    screen.getByRole('dialog').focus();
    await u.tab({ shift: true });
    expect(document.activeElement).toBe(three);
    screen.getByRole('dialog').focus();
    await u.tab();
    expect(document.activeElement).toBe(one);
    // Middle of the sheet tabs normally.
    one.focus();
    await u.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Two'));
  });

  test('Tab never leaves to the page behind, even if focus was outside', async () => {
    render(
      <div>
        <button>Outside</button>
        <Sheet open onClose={() => {}} title="Pick"><button>One</button></Sheet>
      </div>,
    );
    screen.getByRole('button', { name: 'Outside' }).focus();
    await userEvent.setup().tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'One' }));
  });

  test('a sheet with nothing focusable keeps focus on itself', async () => {
    render(<Sheet open onClose={() => {}} title="Pick"><p>hi</p></Sheet>);
    await userEvent.setup().tab();
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });
});
