import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const save = vi.hoisted(() => vi.fn());
vi.mock('../lib/queries', () => ({ useUpdateProfile: () => ({ mutateAsync: save }) }));
vi.mock('../lib/config', () => ({ APP_NAME: 'Bills' }));

import NameStep from './NameStep';

describe('NameStep', () => {
  let user: ReturnType<typeof userEvent.setup>;
  beforeEach(() => {
    save.mockReset().mockResolvedValue(undefined);
    user = userEvent.setup();
  });
  afterEach(cleanup);

  test('trims the name and saves display_name', async () => {
    render(<NameStep userId="u1" />);
    await user.type(screen.getByLabelText(/your name/i), '   Mom  ');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ display_name: 'Mom' });
  });

  test('refuses an empty name', async () => {
    render(<NameStep userId="u1" />);
    await user.type(screen.getByLabelText(/your name/i), '   ');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/name/i);
  });

  test('refuses a 41-character name but accepts 40', async () => {
    render(<NameStep userId="u1" />);
    const input = screen.getByLabelText(/your name/i);
    await user.type(input, 'a'.repeat(41));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/40/);
    await user.clear(input);
    await user.type(input, 'a'.repeat(40));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  test('saves once even if clicked twice while pending', async () => {
    let finish: () => void = () => {};
    save.mockReturnValue(new Promise<void>((r) => (finish = r)));
    render(<NameStep userId="u1" />);
    await user.type(screen.getByLabelText(/your name/i), 'Mom');
    const button = screen.getByRole('button', { name: /continue/i });
    await user.click(button);
    await user.click(button);
    expect(save).toHaveBeenCalledTimes(1);
    finish();
  });

  test('shows calm copy on failure and allows a retry', async () => {
    save.mockImplementationOnce(() => Promise.reject({ message: 'not_signed_in' }));
    render(<NameStep userId="u1" />);
    await user.type(screen.getByLabelText(/your name/i), 'Mom');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText('Please sign in again.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(save).toHaveBeenCalledTimes(2);
  });
});
