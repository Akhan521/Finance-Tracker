# D11b. Visual theme and the second view's purpose: Decided

**Decided: a light theme in cream and pastels.**
- A cream background, with soft pastel status colors: sage green for paid,
  rose for overdue, butter yellow for upcoming. (The exact shades are Claude's
  call; adjust freely.)
- Pastel category colors where categories are shown.

**Decided: the second view must add something.** The first pie mockup only
repeated the calendar's information in another shape. It was rejected for
looking plain and for being redundant.

**Decided: A, the category donut.** The second view answers "where does the
money go this month?", which the calendar can't. It also shows how much of
each category is paid. The center shows the amount left to pay out of the
month's total, and the legend lists each category with what's paid, overdue,
or left.

**Consequence for the bill model (D10).** Every bill needs a category, because
the donut groups by category. A bill's "type" from D10 serves as its category.
Custom categories are allowed.

**Options that were mocked up:**
- A. **Category donut:** slices are categories (housing, car, utilities, ...)
  sized by their share of the month. Each slice is solid for paid and pale for
  still owed. It shows where the money goes, which the calendar can't.
- B. **Progress rings:** one ring per category that fills as its bills are
  paid. It shows how close each category is to done, but not how big each
  category is.
- C. **Status donut, restyled:** rounded segments with gaps and a minimum
  slice size so overdue stays visible. It's prettier, but it still repeats the
  calendar.
