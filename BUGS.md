# Bug Report

Every bug below was found by writing tests against the behaviour the README and
`ASSIGNMENT.md` describe, then running them against the original code. Nothing
here was found by reading alone — the test suite was committed first (commit
`d807937`), and its 35 failures out of 118 are the raw material for this report.

Baseline, before any fix:

```
Test Suites: 3 failed, 3 total
Tests:       35 failed, 83 passed, 118 total
```

Line numbers refer to the code as it was at the initial commit (`2b32db7`).

---

## Summary

| # | Bug | Location | Severity | Status |
|---|-----|----------|----------|--------|
| 1 | Status filter matches substrings, not statuses | `taskService.js:9` | High | Fixed |
| 2 | Pagination is off by one page — page 1 is unreachable | `taskService.js:11-14` | High | Fixed |
| 3 | Completing a task silently resets its priority | `taskService.js:70` | High | Fixed |
| 4 | `PUT /tasks/:id` lets a client rewrite `id` and strand the task | `taskService.js:50` | High | Fixed |
| 5 | `completedAt` drifts out of sync with `status` | `taskService.js:46-53` | Medium | Fixed |
| 6 | Falsy-but-present fields skip validation entirely | `validators.js:8,11,14` | Medium | Fixed |
| 7 | Malformed JSON reports 500; unknown routes return HTML | `app.js:9-12` | Medium | Fixed |
| 8 | Bad `page`/`limit` values are silently replaced with defaults | `routes/tasks.js:20-21` | Medium | Fixed |
| 9 | `limit` has no ceiling | `routes/tasks.js:21` | Low | Fixed |
| 10 | `status` and pagination cannot be combined | `routes/tasks.js:14-24` | Low | Fixed |
| 11 | Completing twice rewrites the completion time | `taskService.js:63-77` | Low | Fixed |
| 12 | The store hands out live object references | `taskService.js:5,7` | Medium | Reported |
| 13 | `dueDate` accepts non-ISO strings the error message forbids | `validators.js:14` | Low | Reported |
| 14 | Invalid `dueDate` values are silently never overdue | `taskService.js:23` | Low | Reported |
| 15 | No `GET /tasks/:id` | `routes/tasks.js` | Low | Reported |
| 16 | README documents status values the API does not accept | `README.md:77, 96` | Medium | Reported |

Part B asked for one fix. Eleven are fixed because each is small, unambiguous,
and pinned by a test. The four left alone are the ones where the right answer is
a product or architecture decision rather than a correction — reasoning below.

---

## 1. Status filter matches substrings, not statuses

**Location:** `src/services/taskService.js:9`

```js
const getByStatus = (status) => tasks.filter((t) => t.status.includes(status));
```

**Expected:** `GET /tasks?status=todo` returns only tasks whose status is `todo`.

**Actual:** `.includes()` on a string is a substring test, not equality. Any
query string that happens to appear inside a status matches it:

- `?status=o` matches **all three** statuses — `t**o**do`, `in_pr**o**gress`,
  `d**o**ne` — so the filter returns the entire store.
- `?status=progress` matches `in_progress`.
- `?status=` (empty) matches everything, because `''` is a substring of every
  string.

The caller has no way to tell a filtered result from an unfiltered one.

**How I found it:** I wrote the obvious happy-path test first
(`?status=todo` returns one task), which passed. The edge case that broke it was
asking what a *partial* status does — `getByStatus('o')` — because the whole
point of a filter is what it excludes, not what it includes.

**Fix:** strict equality. The route additionally rejects a status outside
`['todo','in_progress','done']` with 400. Returning `[]` for an unrecognised
status was the alternative, but then a typo is indistinguishable from "no tasks
match", which is exactly the confusion this bug already causes.

---

## 2. Pagination is off by one page

**Location:** `src/services/taskService.js:11-14`

```js
const getPaginated = (page, limit) => {
  const offset = page * limit;
  return tasks.slice(offset, offset + limit);
};
```

**Expected:** `?page=1&limit=10` returns tasks 1-10.

**Actual:** the route defaults to `page = 1`, and the offset is `page * limit`,
so the first page starts at index 10. `?page=1&limit=10` returns tasks 11-20.
**The first ten tasks cannot be reached through the paginated endpoint at all.**
`?limit=5` with no page is the same story — the five most recent tasks are
invisible.

This is the worst bug of the set, because nothing errors. A client paging
through the list just quietly never sees the first page of data.

**How I found it:** asserting on the actual contents of page 1 rather than only
its length. A length assertion (`toHaveLength(10)`) passes on the buggy code —
it is testing that pagination returns *something*, not that it returns the
*right* something.

**Fix:** `offset = (page - 1) * limit`. Pages are 1-based, matching the `?page=1`
in the docs. A 0-based API would be defensible on its own, but not while the
documentation says otherwise.

---

## 3. Completing a task silently resets its priority

**Location:** `src/services/taskService.js:70`

```js
const updated = {
  ...task,
  priority: 'medium',   // <-- unrelated to completing
  status: 'done',
  completedAt: new Date().toISOString(),
};
```

**Expected:** `PATCH /tasks/:id/complete` changes status and completion time.

**Actual:** it also forces `priority` back to `'medium'`. Complete a `high`
priority task and that flag is gone — not restorable, since the old value was
never stored anywhere. Any report of "what high-priority work did we finish"
returns nothing.

**How I found it:** the test asserts the *whole* task after completion, not just
the two fields the endpoint is about. Asserting only on `status` and
`completedAt` would have passed.

**Fix:** removed the line. This is the one fix I would flag for a second opinion
before merging — it is conceivable that resetting priority was deliberate, on
the theory that a finished task is no longer urgent. But an endpoint named
`/complete` overwriting user-entered data with no way to recover it is a
surprise either way, and if it is intended it belongs in the docs.

---

## 4. `PUT /tasks/:id` lets a client rewrite `id`

**Location:** `src/services/taskService.js:50`

```js
const updated = { ...tasks[index], ...fields };   // fields is the raw req.body
```

**Expected:** a client can change title, description, status, priority and
dueDate. `id` and `createdAt` are server-owned.

**Actual:** every key in the request body is copied onto the stored task. The
worst case:

```http
PUT /tasks/abc-123
{"id": "anything"}
```

The task keeps its slot in the array but now answers to a different id, so
`GET`, `PUT` and `DELETE` on its own URL all 404. It is stranded — still
occupying memory, still counted in `/tasks/stats`, unreachable by any route.

Same mechanism rewrites `createdAt`, backdates or forges `completedAt`, and
persists arbitrary junk (`{"role":"admin"}` is stored verbatim and returned to
every subsequent reader). With no auth layer here the impact is limited to data
integrity, but this is the classic mass-assignment shape — the moment a
privileged field exists on the model, it is writable.

**How I found it:** looking at what `update` does with input it was never told
to trust, then writing the test that names the invariant ("ignores attempts to
overwrite the id").

**Fix:** an explicit whitelist — `title`, `description`, `status`, `priority`,
`dueDate`. Unknown keys are dropped rather than 400, so clients that echo back a
full task object keep working; rejecting them would be stricter but breaks a
very common client pattern.

---

## 5. `completedAt` drifts out of sync with `status`

**Location:** `src/services/taskService.js:46-53`

**Expected:** a task with `status: "done"` has a completion time; a task that
is not done has `completedAt: null`.

**Actual:** only `PATCH /complete` maintains `completedAt`. Going through `PUT`:

- `{"status":"done"}` → done, `completedAt: null`.
- complete a task, then `{"status":"todo"}` → reopened, but still carrying the
  completion timestamp from before.

Two endpoints write the same pair of fields and only one of them keeps them
consistent, so the record contradicts itself depending on which route the client
used.

**How I found it:** cross-checking the two write paths against each other. Each
endpoint tested in isolation looks fine; the bug only appears when you ask
whether they agree.

**Fix:** `update()` derives `completedAt` from a status transition — entering
`done` stamps it, leaving `done` clears it. Combined with fix 4, `completedAt`
is no longer settable from a request body at all.

**Caveat worth raising in review:** reopening now discards the original
completion time. That fits the single-field shape the README documents, but if
completion history matters this should be an append-only event log instead of
one nullable column.

---

## 6. Falsy-but-present fields skip validation entirely

**Location:** `src/utils/validators.js:8, 11, 14` (and 26, 27, 30)

```js
if (body.status && !VALID_STATUSES.includes(body.status)) { ... }
```

**Expected:** `{"title":"x","status":""}` is rejected — `""` is not a valid
status.

**Actual:** `""` is falsy, so the guard short-circuits and the check never runs.
The task is created with `status: ""`. That task is then:

- invisible to `?status=todo|in_progress|done`,
- uncounted by `/tasks/stats`, which only tallies the three known statuses.

It exists, and it appears in `GET /tasks`, but no filter or count acknowledges
it. Same hole for `priority` and `dueDate`.

**How I found it:** table-driven validator tests. Once the cases are laid out as
a list, `''` is the obvious row to add next to `undefined` and `null`.

**Fix:** `!== undefined` guards — `undefined` is the only value that actually
means "not supplied". `dueDate` keeps an explicit `null` exemption, since `null`
is how a caller clears a deadline. The duplicated rules across create and update
are now one shared helper; that duplication is how the two could have drifted.

---

## 7. Malformed JSON reports 500; unknown routes return HTML

**Location:** `src/app.js:9-12`

**Expected:** an unparseable body is a client error (400). Every response from a
JSON API is JSON.

**Actual:** `express.json()` throws on a malformed body, which lands in the
error handler and comes back as `500 Internal server error`. That tells the
client the server is broken and the request is worth retrying, when in fact the
request can never succeed. An unmatched route falls through to Express's default
handler, which returns an HTML error page — so a client calling `res.json()` on
every response gets a parse failure instead of a readable 404.

**How I found it:** sending a deliberately truncated body (`{"title": "unclosed`)
and requesting a route that does not exist.

**Fix:** handle `entity.parse.failed` as 400, pass through other 4xx from
body-parser (payload too large, bad charset) instead of masking them as 500, and
add a JSON catch-all 404 before the error handler.

---

## 8. Bad `page`/`limit` values are silently replaced with defaults

**Location:** `src/routes/tasks.js:20-21`

```js
const pageNum = parseInt(page) || 1;
const limitNum = parseInt(limit) || 10;
```

**Expected:** `?page=abc` is a bad request.

**Actual:** it is page 1. So is `?page=0`, and `?limit=-5` becomes 10 —
`parseInt('abc')` is `NaN`, which `||` swallows. `parseInt` is also too
forgiving in the other direction: `?limit=3cats` parses to 3. A client that
mistypes a page number is served a *different page* than the one it asked for
and told nothing.

**Fix:** parse strictly (`/^\d+$/`, then `>= 1`) and 400 on anything else.

---

## 9. `limit` has no ceiling

**Location:** `src/routes/tasks.js:21`

`?limit=1000000` returns the entire store in one response. On an in-memory demo
that is merely slow; against a real dataset it is a trivially available way to
exhaust memory and saturate the response path. **Fix:** capped at 100, 400 above
that.

---

## 10. `status` and pagination cannot be combined

**Location:** `src/routes/tasks.js:14-24`

The `status` branch returns before `page`/`limit` are read, so
`?status=done&page=2` silently ignores the pagination and returns every done
task. Both features are documented; nothing says they are mutually exclusive.
**Fix:** filter first, then paginate.

---

## 11. Completing twice rewrites the completion time

**Location:** `src/services/taskService.js:63-77`

`PATCH /complete` on an already-completed task re-stamps `completedAt` with the
current time. A retried or double-clicked request moves the recorded completion
time to now, losing when the work was actually finished. **Fix:** completing a
task that is already `done` returns it unchanged.

---

# Reported, not fixed

These need a decision rather than a correction, so I have written them up
instead of guessing.

## 12. The store hands out live object references

**Location:** `src/services/taskService.js:5, 7`

```js
const getAll = () => [...tasks];
const findById = (id) => tasks.find((t) => t.id === id);
```

`getAll` copies the *array* but not the objects in it, and `findById` returns the
stored object directly. Any caller can mutate the store without going through
`update()`:

```js
taskService.findById(id).status = 'whatever';   // no validation, no audit
```

Nothing in the current routes does this, so there is no live bug to demonstrate
— which is why it is reported rather than fixed. But it means the service's
encapsulation is advisory, and the first caller that mutates a returned task
will do it by accident.

**What a fix looks like:** return structural clones, or freeze the objects on
the way out. Both cost something on every read, and the right call depends on
whether this store stays in memory or becomes a repository over a real database
— in which case the problem disappears on its own. Not worth paying for
speculatively.

## 13. `dueDate` accepts non-ISO strings its own error message forbids

**Location:** `src/utils/validators.js:14`

The check is `isNaN(Date.parse(body.dueDate))` but the error says "must be a
valid ISO date string". `Date.parse` accepts plenty that is not ISO-8601 —
`"March 5, 2020"`, `"2020"` — and its handling of non-standard formats is
implementation-defined, so the same input can parse differently across
runtimes. Tightening it to a real ISO check is a breaking change for any client
already sending loose formats, so it needs a call on who is using it. The
cheaper interim fix is to correct the error message.

## 14. Invalid `dueDate` values are silently never overdue

**Location:** `src/services/taskService.js:23`

`new Date('garbage') < now` is `false`, not an error — `NaN` comparisons are
always false. So a task with an unparseable `dueDate` that slipped in before
validation existed can never be counted overdue and will never be noticed.
Related to 13; the fix is the same fix.

## 15. No `GET /tasks/:id`

Not in the spec, so not strictly a bug, but every write endpoint returns a task
and there is no way to read one back individually — a client has to fetch the
whole list and filter it. Worth adding before this is used by anything real.

## 16. The README documents status values the API does not accept

**Location:** `README.md:77` and `README.md:96`

`README.md` gives the task shape as:

```json
"status": "pending | in-progress | completed"
```

The code and `ASSIGNMENT.md` both use `todo | in_progress | done`. Not one of
the three README values is valid — different words, and a hyphen where the code
has an underscore. The sample request two sections further down,

```bash
curl "http://localhost:3000/tasks?status=pending&page=1&limit=10"
```

returns `[]` against the original code and `400` after fix 1. Anyone integrating
from the README writes code that cannot work, and the failure mode before this
fix was an empty list rather than an error — so they would have gone looking in
their own code first.

I am reporting rather than fixing this because I do not know which document is
authoritative. `ASSIGNMENT.md` agrees with the code, so my assumption is that
the README drifted and it is the README that should change — but if `pending` /
`in-progress` / `completed` is where the product is heading, the fix is a
migration on the other side, and that is not my call to make silently.

This one is worth more than its severity rating suggests: three of the bugs
above (1, 2, 6) are ultimately the code and the documentation disagreeing about
the contract. That is a pattern, not four separate accidents.

---

# After the fixes

```
Test Suites: 4 passed, 4 total
Tests:       164 passed, 164 total

-----------------|---------|----------|---------|---------|
File             | % Stmts | % Branch | % Funcs | % Lines |
-----------------|---------|----------|---------|---------|
All files        |   97.87 |    97.24 |   97.22 |   97.63 |
 app.js          |   80.95 |    81.81 |      75 |   80.95 |
 routes/tasks.js |     100 |      100 |     100 |     100 |
 taskService.js  |     100 |    96.77 |     100 |     100 |
 validators.js   |     100 |      100 |     100 |     100 |
-----------------|---------|----------|---------|---------|
```

The uncovered lines in `app.js` are the generic 500 fallback and the
`app.listen` call. Neither is reachable from the test suite: the 500 branch only
fires on an error no route currently throws, and covering it would mean adding a
throwing route that exists only for the test.
