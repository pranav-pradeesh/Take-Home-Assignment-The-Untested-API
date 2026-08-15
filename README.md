# Take-Home Assignment — The Untested API

> ## Submission — Pranav Pradeesh
>
> | | |
> |---|---|
> | **Bug report** | **[BUGS.md](./BUGS.md)** — 16 findings, 11 fixed |
> | **Notes** | **[NOTES.md](./NOTES.md)** — design decisions, surprises, questions before shipping |
> | **Tests** | [`task-api/tests/`](./task-api/tests) — 164 passing, 97.9% statements / 97.2% branches |
> | **New endpoint** | `PATCH /tasks/:id/assign` — [`src/routes/tasks.js`](./task-api/src/routes/tasks.js) |
> | **Live** | see [Live deployment](#live-deployment) below |
>
> ```bash
> cd task-api && npm install && npm run coverage
> ```
>
> The commit history is the working log: tests were committed first and fail
> 35/118 against the original code, then one commit per bug fix with the
> reasoning in the message, then the new endpoint (tests before implementation).
>
> **Read [BUGS.md](./BUGS.md) and [NOTES.md](./NOTES.md) first** — the bug report
> covers where each bug lives and why it happens, and the notes cover the design
> decisions on the new endpoint.

---

A 2-day take-home assignment. You'll read unfamiliar code, write tests, track down bugs, and ship a small feature.

Read **[ASSIGNMENT.md](./ASSIGNMENT.md)** for the full brief before you start.

---

## A note on AI tools

You're welcome to use AI tools. What we're evaluating is your ability to read and reason about unfamiliar code — so your submission should reflect your own understanding, not just generated output.

Concretely:
- For each bug you report: include where in the code it lives and why it happens
- For the feature you implement: briefly explain the design decisions you made
- If something surprised you or you had to make a tradeoff, say so

---

## Getting Started

**Prerequisites:** Node.js 18+

```bash
cd task-api
npm install
npm start        # runs on http://localhost:3000
```

**Tests:**

```bash
npm test           # run test suite
npm run coverage   # run with coverage report
```

---

## Project Structure

```
task-api/
  src/
    app.js                  # Express app setup
    routes/tasks.js         # Route handlers
    services/taskService.js # Business logic + in-memory data store
    utils/validators.js     # Input validation helpers
  tests/                    # Your tests go here
  package.json
  jest.config.js
ASSIGNMENT.md               # Full brief — read this first
```

> The data store is in-memory. It resets every time the server restarts.

---

## API Reference

| Method   | Path                      | Description                              |
|----------|---------------------------|------------------------------------------|
| `GET`    | `/tasks`                  | List all tasks. Supports `?status=`, `?page=`, `?limit=` |
| `POST`   | `/tasks`                  | Create a new task                        |
| `PUT`    | `/tasks/:id`              | Full update of a task                    |
| `DELETE` | `/tasks/:id`              | Delete a task (returns 204)              |
| `PATCH`  | `/tasks/:id/complete`     | Mark a task as complete                  |
| `GET`    | `/tasks/stats`            | Counts by status + overdue count         |
| `PATCH`  | `/tasks/:id/assign`       | **Assign a task to a user** _(to implement)_ |

### Task shape

> **Note:** the `status` values below do not match the code or `ASSIGNMENT.md`,
> which both use `todo | in_progress | done` — and the `?status=pending` sample
> request further down cannot succeed. Left as-is because I do not know which
> document is authoritative; written up as finding 16 in [BUGS.md](./BUGS.md).
> The `assignee` and `assignedAt` fields added by the new endpoint are also
> missing from this shape.

```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "status": "pending | in-progress | completed",
  "priority": "low | medium | high",
  "dueDate": "ISO 8601 or null",
  "completedAt": "ISO 8601 or null",
  "createdAt": "ISO 8601"
}
```

### Sample requests

**Create a task**
```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Write tests", "priority": "high"}'
```

**List tasks with filter**
```bash
curl "http://localhost:3000/tasks?status=pending&page=1&limit=10"
```

**Mark complete**
```bash
curl -X PATCH http://localhost:3000/tasks/<id>/complete
```

---

## Live deployment

Deployed on Vercel from `task-api/` as a serverless function —
[`api/index.js`](./task-api/api/index.js) re-exports the Express app and
[`vercel.json`](./task-api/vercel.json) rewrites every path to it. `npm start`
is untouched and still runs a normal server locally.

`GET /` returns the endpoint list, so the root URL is a usable starting point.

```bash
BASE=https://<deployment>.vercel.app

curl $BASE/
curl -X POST $BASE/tasks -H 'Content-Type: application/json' \
  -d '{"title":"Write tests","priority":"high"}'
curl $BASE/tasks
curl -X PATCH $BASE/tasks/<id>/assign -H 'Content-Type: application/json' \
  -d '{"assignee":"Pranav"}'
curl $BASE/tasks/stats
```

**One caveat, stated plainly:** the store is an array in process memory. On
serverless that memory belongs to a single warm instance — requests made close
together share state, a cold start begins from an empty store, and two
concurrent instances do not see each other's data. So the live URL demonstrates
the API surface, not durable storage. That is a property of putting an
in-memory store behind serverless rather than a fault in the code, and it is the
third blocking question in [NOTES.md](./NOTES.md). A persistent host (Render,
Fly, a container) would hold state for as long as the process lives; nothing
short of a real datastore survives a restart.

---

## What to Submit

See [ASSIGNMENT.md](./ASSIGNMENT.md) for full submission requirements. At minimum, include:

- **Test files** — covering the endpoints and edge cases you identified
- **Bug report** — what you found, where in the code, and why it's a bug (not just symptoms)
- **At least one fix** — with a note on your approach
- **`PATCH /tasks/:id/assign` implementation** — plus a short explanation of any design decisions (validation, edge cases, etc.)
