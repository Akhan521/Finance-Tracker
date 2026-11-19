import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mockAuth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: { auth: mockAuth } }));
vi.mock('../lib/config', () => ({ APP_NAME: 'Bills' }));

import SignIn from './SignIn';

const NEUTRAL = 'If this email has access, a code is on its way.';
const BAD_CODE = "That code didn't work. Check it or send a new one.";

async function toCodeStep(user: ReturnType<typeof userEvent.setup>, email = 'mom@example.com') {
  await user.type(screen.getByLabelText(/email/i), email);
  await user.click(screen.getByRole('button', { name: /send code/i }));
  await screen.findByLabelText(/code/i);
}

describe('SignIn', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockAuth.signInWithOtp.mockReset().mockResolvedValue({ error: null });
    mockAuth.verifyOtp.mockReset().mockResolvedValue({ error: null });
    user = userEvent.setup();
  });

  afterEach(cleanup);

  test.each([[{ error: null }], [{ error: { message: 'Signups not allowed' } }]])(
    'shows the same neutral message whatever the server says (%#)',
    async (reply) => {
      mockAuth.signInWithOtp.mockResolvedValue(reply);
      render(<SignIn />);
      await user.type(screen.getByLabelText(/email/i), ' Mom@Example.com ');
      await user.click(screen.getByRole('button', { name: /send code/i }));
      expect(await screen.findByText(NEUTRAL)).toBeTruthy();
      expect(mockAuth.signInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'mom@example.com' }),
      );
    },
  );

  test('a 403 with status and code fields shows the same neutral message', async () => {
    mockAuth.signInWithOtp.mockResolvedValue({
      error: { message: 'Signups not allowed for this instance', status: 403, code: 'hook_failed' },
    });
    render(<SignIn />);
    await toCodeStep(user);
    expect(screen.getByText(NEUTRAL)).toBeTruthy();
    expect(screen.queryByText(/signups/i)).toBeNull();
  });

  test('sends the device time zone as signup data and does not block signup', async () => {
    render(<SignIn />);
    await toCodeStep(user);
    const arg = mockAuth.signInWithOtp.mock.calls[0][0];
    expect(arg.options.data.time_zone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(arg.options).not.toHaveProperty('shouldCreateUser');
  });

  test('code field accepts 6 digits only and calls verifyOtp with type "email"', async () => {
    render(<SignIn />);
    await toCodeStep(user, ' Mom@Example.com ');
    const input = screen.getByLabelText(/code/i);
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    expect(input.getAttribute('maxlength')).toBe('6');

    await user.type(input, '12a3-4 5678');
    expect((input as HTMLInputElement).value).toBe('123456');

    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
      email: 'mom@example.com',
      token: '123456',
      type: 'email',
    });
  });

  test('does not call verifyOtp until all 6 digits are entered', async () => {
    render(<SignIn />);
    await toCodeStep(user);
    await user.type(screen.getByLabelText(/code/i), '123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(mockAuth.verifyOtp).not.toHaveBeenCalled();
  });

  test('a wrong or expired code shows the friendly message, never the server text', async () => {
    mockAuth.verifyOtp.mockResolvedValue({
      error: { message: 'Token has expired or is invalid', status: 403, code: 'otp_expired' },
    });
    render(<SignIn />);
    await toCodeStep(user);
    await user.type(screen.getByLabelText(/code/i), '000000');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(BAD_CODE)).toBeTruthy();
    expect(screen.queryByText(/token has expired/i)).toBeNull();
    expect(screen.queryByText(/otp_expired/i)).toBeNull();
  });

  test('a 429 shows the same neutral text, moves on, and locks resend; no wait text', async () => {
    mockAuth.signInWithOtp.mockResolvedValue({
      error: { message: 'Email rate limit exceeded', status: 429, code: 'over_email_send_rate_limit' },
    });
    const { container } = render(<SignIn />);
    await toCodeStep(user);
    expect(screen.getByText(NEUTRAL)).toBeTruthy();
    expect(container.textContent).not.toMatch(/wait|rate limit/i);
    expect(
      (screen.getByRole('button', { name: /send a new code/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  test.each([['123 456'], ['123-456'], [' 123456 ']])('pasting %j gives 123456 and can be submitted', async (text) => {
    render(<SignIn />);
    await toCodeStep(user);
    const input = screen.getByLabelText(/code/i) as HTMLInputElement;
    await user.click(input);
    await user.paste(text);
    expect(input.value).toBe('123456');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(mockAuth.verifyOtp).toHaveBeenCalledWith(expect.objectContaining({ token: '123456' }));
  });

  test('double-clicking Send code sends one request', async () => {
    render(<SignIn />);
    await user.type(screen.getByLabelText(/email/i), 'mom@example.com');
    await user.dblClick(screen.getByRole('button', { name: /send code/i }));
    await screen.findByLabelText(/code/i);
    expect(mockAuth.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  test('"Use a different email" moves focus to the email field', async () => {
    render(<SignIn />);
    await toCodeStep(user);
    await user.click(screen.getByRole('button', { name: /use a different email/i }));
    expect(document.activeElement).toBe(screen.getByLabelText(/email/i));
  });

  test('messages are announced politely', async () => {
    render(<SignIn />);
    await toCodeStep(user);
    expect(screen.getByRole('status').textContent).toBe(NEUTRAL);
  });

  test('no server error text is rendered, even when the request throws', async () => {
    mockAuth.signInWithOtp.mockRejectedValue(new Error('boom: secret internal detail'));
    const { container } = render(<SignIn />);
    await toCodeStep(user);
    expect(container.textContent).not.toMatch(/boom|secret internal/i);
    expect(screen.getByText(NEUTRAL)).toBeTruthy();
  });

  test('"Use a different email" returns to the email step', async () => {
    render(<SignIn />);
    await toCodeStep(user);
    await user.click(screen.getByRole('button', { name: /use a different email/i }));
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.queryByLabelText(/code/i)).toBeNull();
  });

  describe('resend wait', () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    afterEach(() => vi.useRealTimers());

    test('"Send a new code" is locked for 60 s, then sends again', async () => {
      const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<SignIn />);
      await toCodeStep(u);
      const resend = screen.getByRole('button', { name: /send a new code/i });
      expect((resend as HTMLButtonElement).disabled).toBe(true);
      await act(async () => {
        vi.advanceTimersByTime(59_000);
      });
      expect((resend as HTMLButtonElement).disabled).toBe(true);
      await act(async () => {
        vi.advanceTimersByTime(2_000);
      });
      expect((resend as HTMLButtonElement).disabled).toBe(false);
      await u.click(resend);
      expect(mockAuth.signInWithOtp).toHaveBeenCalledTimes(2);
      expect(mockAuth.signInWithOtp.mock.calls[1][0].email).toBe('mom@example.com');
      expect((screen.getByRole('button', { name: /send a new code/i }) as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
