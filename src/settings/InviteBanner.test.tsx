import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const accept = vi.hoisted(() => vi.fn());
vi.mock('../lib/queries', () => ({ useAcceptInvite: () => ({ mutateAsync: accept }) }));

import InviteBanner from './InviteBanner';

const invite = { id: 'i1', household_name: '<b>Home</b>', invited_by_name: 'Sam', expires_at: '2030-01-01T00:00:00Z' };

describe('InviteBanner', () => {
  beforeEach(() => accept.mockReset().mockResolvedValue('h1'));
  afterEach(cleanup);

  test('shows names as plain text', () => {
    const { container } = render(<InviteBanner userId="u1" invite={invite} onDismiss={() => {}} />);
    expect(screen.getByText('Join <b>Home</b>?')).toBeTruthy();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText(/Sam/)).toBeTruthy();
  });

  test('accept calls the mutation with the invite id', async () => {
    render(<InviteBanner userId="u1" invite={invite} onDismiss={() => {}} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Accept' }));
    expect(accept).toHaveBeenCalledWith('i1');
  });

  test('Not now dismisses', async () => {
    const onDismiss = vi.fn();
    render(<InviteBanner userId="u1" invite={invite} onDismiss={onDismiss} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  test('failure shows calm copy', async () => {
    accept.mockImplementationOnce(() => Promise.reject({ message: 'already_in_household' }));
    render(<InviteBanner userId="u1" invite={invite} onDismiss={() => {}} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Accept' }));
    const alert = await screen.findByText('You are already in a household.');
    expect(alert.getAttribute('role')).toBe('alert');
  });

  test('falls back when the inviter has no name', () => {
    render(<InviteBanner userId="u1" invite={{ ...invite, invited_by_name: null }} onDismiss={() => {}} />);
    expect(screen.getByText('Invited by a household member')).toBeTruthy();
  });
});
