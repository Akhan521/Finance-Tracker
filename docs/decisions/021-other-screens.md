# D21. The other screens: Decided

Designed using browser mockups (`screens-v1.html` and `screens-v2.html` in the
git-ignored `.superpowers/brainstorm/` folder).

**Look across the app (from Aamir's reactions).** The Settings style sets the
pattern for every screen: soft grouped rows on cream, one thing per line, and
generous spacing. Avoid chip clouds, dense forms, and colored callout boxes.

## Marking a bill paid

Tap a day on the calendar, then the bill, and a sheet slides up.
- **Steady bill (approved).** The usual amount and today's date are
  pre-filled, so it's one tap on "Mark paid". There's an "Open payment page ↗"
  link (D7).
- **Amount differs: a quiet switch (chosen over asking afterwards).**
  - A grey "usually $60" appears under the amount.
  - When the typed amount differs, one extra row appears: "Use $72 from now
    on," with a switch.
  - Off (the default) means just this time; on updates the usual amount for
    future bills.
  - No pop-up, no question. This replaces the "Just this time, or from now
    on?" prompt in D10.
- **Credit card (confirmed by Aamir 2026-10-25).** It asks for this cycle's
  minimum, optionally the statement balance, then the amount being paid, and
  shows "Minimum covered ✓."
- **Who paid** is recorded automatically as whoever taps "Mark paid."
  (Claude's call.)

## Adding a bill: one calm page (chosen over step-by-step)

- The name as a big title, then a Household / Just mine switch.
- Three rows: **Amount**, **Due** (day and how often), **Category**. Tapping a
  row opens a simple picker.
- "More details" holds the optional nickname, last 4 digits, and payment link.
- "Due" offers every month, every N weeks, every year, or just once.

## Editing a bill

- The same rows as adding a bill, plus "Payment page."
- **History as a simple timeline:** what happened in normal text ("Paid
  $1,980"), with the date and who in small grey text below. Green dots for
  payments, lavender dots for changes.
- "Archive bill" sits quietly at the bottom.

## Settings and household (approved as mocked up)

- **Settings:**
  - Email reminders: household bills on/off, my bills on/off, and how many
    days ahead.
  - Your data: export to CSV, and "keep history for" (editable by owners
    only).
  - Account: sign out of all devices, leave household, delete account.
- **Household (owner view):** members with their roles, pending invites with
  expiry and cancel, and "+ Invite someone by email." Tap a member to make
  them an owner or remove them. Non-owners see only the member list.

**Navigation (Claude's call).** "+" (new bill) and a small gear (settings) sit
on the home screen.
