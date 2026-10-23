# D7. Store as little sensitive data as possible: Decided

**Decision.** The app never stores:
- card numbers,
- full account numbers,
- website logins or passwords for the companies being paid.

**Allowed instead, to tell similar bills apart:**
- a nickname (e.g. "Chase Visa (Aamir)", "Car loan, Honda"),
- optionally the last 4 digits of an account or card,
- a link to the company's payment page.

**Why.** Data that's never stored can't leak. Card numbers in particular can
be used immediately if stolen, and storing them brings in the payment card
industry's security rules (PCI DSS). The tracker doesn't need either: bills
are paid through each company's own site or app.

**Where logins go instead.** A password manager. The household is all Apple,
so the built-in Passwords app works and can share a group of passwords with
family members.
