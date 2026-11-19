// Maps the error keys raised in SQL (and the delete-account function) to calm
// copy. The server's own text is never shown.
const MESSAGES: Record<string, string> = {
  already_in_household: 'You are already in a household.',
  already_invited: 'That person already has an invite.',
  bad_time_zone: "That time zone isn't recognised.",
  category_scope_mismatch: "That category doesn't belong with this bill.",
  email_not_confirmed: 'Please confirm your email address first.',
  forbidden: "You don't have access to do that.",
  household_needs_member: 'A household needs at least one member.',
  invite_not_found: "That invite isn't available any more.",
  invite_not_pending: 'That invite has already been used or cancelled.',
  last_owner: 'Make someone else an owner first.',
  not_credit_card: 'That only applies to credit card bills.',
  not_signed_in: 'Please sign in again.',
  not_sole_owner: 'Only the one owner of a household can delete it.',
  too_many_invites: 'There are already a lot of open invites. Cancel one first.',
  could_not_delete: "We couldn't delete your account. Please try again.",
  unauthorized: 'Please sign in again.',
};

export const GENERIC_ERROR = 'Something went wrong. Please try again.';

export function errorMessage(e: unknown): string {
  let key: unknown;
  if (e && typeof e === 'object' && 'message' in e) key = (e as { message: unknown }).message;
  else key = e;
  if (typeof key === 'string' && Object.hasOwn(MESSAGES, key)) return MESSAGES[key];
  return GENERIC_ERROR;
}
