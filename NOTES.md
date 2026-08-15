# Submission Notes

## How I worked

Day 1 was tests only. I wrote them against the behaviour `ASSIGNMENT.md`
describes rather than the behaviour the code has, so the failures would be the
bug list instead of me deciding in advance what looked wrong. That commit
(`d807937`) fails 35 of 118 — those failures are what `BUGS.md` is written from.

Day 2 is one commit per bug, each with the reasoning in the commit message, then
the new endpoint (tests first, in a separate commit from the implementation).

The one thing I would do differently: I wrote a few first-pass tests that
asserted only on the field the endpoint was named after (`status` after
`/complete`, `length` after paginating). Those passed on broken code. The bugs
only showed up once the assertions covered the whole task object and the actual
contents of a page. Assertion scope did more work here than test count.

---

## Design decisions on `PATCH /tasks/:id/assign`

The brief asked three questions explicitly. My answers:

**What should happen if `assignee` is an empty string?** 400.

The tempting alternative is to treat `""` as "unassign". I did not, because it
makes two very different intents produce the same request: a user deliberately
clearing an assignment, and a form field nobody filled in. The second is far
more common, and under that reading a stray submit silently wipes an
assignment with no error and no trace. Unassigning is a real operation and
deserves to be unambiguous — `DELETE /tasks/:id/assign` — rather than inferred
from the absence of content. Not built, since it is outside the brief.

**What if the task is already assigned?** Reassign it, 200.

409 Conflict was the alternative. I rejected it: reassignment is a normal thing
to want (people go on leave, work gets handed over), and refusing it would mean
a client has to unassign first — through an endpoint that does not exist. That
turns a routine action into a dead end. `assignedAt` is updated on every
assignment, so a reassignment is still observable.

**What other validation makes sense?** Must be a string; trimmed; non-empty
after trimming; at most 100 characters.

`assignee` is free text, not a foreign key — there is no user store in this
service to validate a name against, so I only enforced what can be checked
honestly here. Trimming happens at the route boundary so `" Pranav "` and
`"Pranav"` cannot become two different assignees in the store. The length cap is
there because an unbounded string field on a public endpoint is a free
write-amplification primitive.

Two more decisions the brief did not ask about:

- **Validation runs before the task lookup.** A malformed body gets the same 400
  whether or not the task exists, so the client fixes one problem at a time.
  Checking existence first is also defensible — it would matter if unknown ids
  were sensitive, which here they are not.
- **`assignee` is not writable through `PUT /tasks/:id`.** One entry point means
  the trim and the length cap cannot be bypassed by sending the field somewhere
  else. `create()` initialises `assignee` and `assignedAt` to `null` so every
  task has the same shape whether or not it has ever been assigned.

---

## What surprised me in the codebase

**The dangerous bugs were the quiet ones.** Nothing in this codebase throws.
The pagination bug makes the first page of data unreachable and returns 200 with
a plausible-looking array. The substring status filter returns rows you did not
ask for, also 200. `/complete` erases a priority and hands you back a task that
looks correct unless you knew what it said before. In every case a monitoring
dashboard shows a healthy service. The only bug that surfaces as an error is the
malformed-JSON 500 — and it surfaces as the *wrong* error, blaming the server
for a bad request.

**Two endpoints owning the same field.** `PATCH /complete` and `PUT /tasks/:id`
both write `status` and `completedAt`, and only one of them keeps the pair
consistent. Each endpoint looks fine in isolation; the bug only exists in the
relationship between them. I would not have found it by reading either function
on its own.

**`.includes()` on a string.** It reads exactly like the array method one line
above it in my head, and it type-checks, and it passes the happy-path test. That
one is going in my review checklist.

**`parseInt(x) || default` is a trap.** It looks like a defensive default and it
is actually input suppression — `NaN`, `0` and negatives all collapse into the
default, so the caller is served a different page than the one it requested and
told nothing about it.

---

## What I would test next, given more time

1. **Concurrency.** Every write is read-modify-write on a shared array
   (`findIndex`, build a new object, assign back). Two overlapping requests to
   the same task can lose an update. Node's single thread makes each synchronous
   handler atomic *today*, so nothing is broken right now — but that safety
   evaporates the moment a write becomes async, which is exactly what happens
   when the store becomes a database. Worth a test that pins the expectation
   before that refactor, not after.
2. **Property-based tests for pagination.** The invariant is easy to state —
   every task appears exactly once across all pages, in order, for any
   page/limit combination — and off-by-one bugs are precisely what
   example-based tests miss. `fast-check` over a random store would have caught
   bug 2 without me having to think of the right example.
3. **`getStats` against timezones and clock edges.** The overdue calculation
   compares parsed dates to `new Date()`. I tested it with dates far from the
   boundary; I have not tested a `dueDate` one millisecond either side of now,
   or a date-only string like `"2026-08-15"` (which parses as UTC midnight and
   is therefore already overdue for anyone west of Greenwich). Freezing the
   clock with `jest.useFakeTimers` is the way in.
4. **Payload and content-type edges.** Deeply nested bodies, `Content-Type:
   text/plain` with a JSON body, arrays where objects are expected. I covered
   malformed JSON and oversized bodies; that family has more members.
5. **A contract test against the documented shape.** Several bugs here are
   really "the code and the README disagree". One test that asserts every
   response matches the documented task shape would catch that class directly
   rather than one field at a time.

---

## Questions I would ask before this ships to production

**Blocking:**

1. **Is anything already calling the paginated endpoint?** Fixing the off-by-one
   changes what `?page=1` returns. Anyone who built around the buggy behaviour —
   or worse, worked around it by asking for page 0 — breaks on deploy. This
   needs a check of real traffic, not an assumption.
2. **Was resetting priority on completion deliberate?** I removed it as a bug.
   If some report depends on completed tasks all being `medium`, I have broken
   it. This is the fix I would most want a second opinion on.
3. **Where does the data actually live?** The store is an array in one process.
   It is lost on every restart and deploy, and it is not shared between
   instances, so the service cannot be scaled horizontally or restarted without
   data loss. If "heading to production" means real users, this is the
   conversation before any of the rest.

**Also worth answering:**

4. **Who is allowed to call this?** There is no authentication, authorisation or
   rate limiting. Every endpoint is fully open, including `DELETE`. Bug 4
   (mass assignment) is contained today only because there are no privileged
   fields on the model yet.
5. **Should `assignee` be a user id rather than free text?** Storing names as
   strings means no rename handling, no validity guarantee, and duplicate
   humans with different spellings. Fine for a demo; a migration later.
6. **Is `/tasks/stats` meant to stay unbounded?** It walks every task on every
   call. At small scale that is free; it is also the kind of endpoint that
   becomes the slowest thing in the system without anyone noticing when it does.
7. **Are unknown fields on `PUT` meant to be ignored or rejected?** I chose
   ignore, to stay compatible with clients that echo back a whole task object.
   Rejecting with 400 is stricter and catches client typos earlier.
