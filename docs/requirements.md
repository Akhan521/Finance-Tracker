# Requirements

What Aamir has told us the tracker needs, and facts about how the household's
bills work. Decisions built on these live in [`decisions/`](decisions/).

- See at a glance when each bill is due.
- See at a glance whether each bill is paid or still pending.
- See how many bills are paid, how many remain, and the total count.
  (A pie or donut chart is one idea; not decided.)
- Data persists: closing the app and coming back later keeps everything intact.
- Nothing is on autopay, on purpose. Household members get paid at different
  times, and bills are paid by hand only once the money is in place.
- Most bills (home, auto loans, utilities, car insurance) stay around the
  same amount each time.
- Credit cards vary: the minimum payment changes a little, and the amount
  actually paid depends on what the household can put down that month.
- Flexible: any kind of bill or expense can be added, not just this
  household's list.
- Who pays what: there are two kinds of bills.
  - Household bills (home, utilities, etc.): funds are pooled, and the parents
    decide and track which ones get paid.
  - Personal bills (credit cards, personal expenses): each household member
    handles their own.
- Amounts must stay editable even for steady bills. A payment can differ from
  the usual amount, and the usual amount itself can change for good (e.g. after
  a refinance).
