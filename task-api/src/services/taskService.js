const { v4: uuidv4 } = require('uuid');

let tasks = [];

const getAll = () => [...tasks];

const findById = (id) => tasks.find((t) => t.id === id);

// Exact match. `includes` was doing a substring test, which turned any shared
// letter into a wildcard (?status=o matched todo, in_progress and done).
const getByStatus = (status) => tasks.filter((t) => t.status === status);

/**
 * Slice a list into a page. `page` is 1-based, matching the documented
 * `?page=1` query — the offset used to be `page * limit`, which made page 1
 * skip the first `limit` records and left them unreachable.
 *
 * Exported so the route can paginate a list that has already been filtered.
 */
const paginate = (list, page, limit) => {
  const offset = (page - 1) * limit;
  return list.slice(offset, offset + limit);
};

const getPaginated = (page, limit) => paginate(tasks, page, limit);

const getStats = () => {
  const now = new Date();
  const counts = { todo: 0, in_progress: 0, done: 0 };
  let overdue = 0;

  tasks.forEach((t) => {
    if (counts[t.status] !== undefined) counts[t.status]++;
    if (t.dueDate && t.status !== 'done' && new Date(t.dueDate) < now) {
      overdue++;
    }
  });

  return { ...counts, overdue };
};

const create = ({ title, description = '', status = 'todo', priority = 'medium', dueDate = null }) => {
  const task = {
    id: uuidv4(),
    title,
    description,
    status,
    priority,
    dueDate,
    completedAt: null,
    // Present from creation so every task has the same shape, whether or not it
    // has ever been assigned. Clients can read task.assignee without guarding
    // for the key being missing.
    assignee: null,
    assignedAt: null,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  return task;
};

/**
 * The only fields a client may change through PUT /tasks/:id.
 *
 * Everything else on a task is server-owned: `id` and `createdAt` are assigned
 * at creation, and `completedAt` is derived from `status`.
 */
const UPDATABLE_FIELDS = ['title', 'description', 'status', 'priority', 'dueDate'];

const update = (id, fields) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  // Copy across the whitelist instead of spreading the raw body. The previous
  // `{ ...task, ...fields }` let a client rewrite id and createdAt and attach
  // arbitrary keys to the stored record.
  const changes = {};
  UPDATABLE_FIELDS.forEach((key) => {
    if (fields[key] !== undefined) changes[key] = fields[key];
  });

  const current = tasks[index];

  // completedAt is derived from status, so keep the two in step. Moving a task
  // to done stamps it; moving it back out clears it. Without this, PUT could
  // produce a done task with no completion time, or a reopened task still
  // carrying the old one.
  if (changes.status !== undefined && changes.status !== current.status) {
    changes.completedAt = changes.status === 'done' ? new Date().toISOString() : null;
  }

  const updated = { ...current, ...changes };
  tasks[index] = updated;
  return updated;
};

const remove = (id) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return false;

  tasks.splice(index, 1);
  return true;
};

const completeTask = (id) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const task = tasks[index];

  // Already finished: return it untouched. Re-stamping completedAt on a retried
  // or duplicated request would overwrite the real completion time.
  if (task.status === 'done' && task.completedAt) return task;

  // Only status and completedAt change here. This used to also force
  // priority back to 'medium', silently discarding user data on an
  // endpoint that says nothing about priority.
  const updated = {
    ...task,
    status: 'done',
    completedAt: new Date().toISOString(),
  };

  tasks[index] = updated;
  return updated;
};

/**
 * Set the assignee on a task. Returns the updated task, or null if there is no
 * task with that id.
 *
 * Deliberately not folded into update(): assignment is its own operation with
 * its own validation rules, and keeping it separate means `assignee` cannot be
 * written through PUT and bypass them. `assignedAt` is stamped here rather than
 * passed in, for the same reason completedAt is — it is server-owned.
 *
 * Reassigning is allowed and overwrites both fields. Handing work to someone
 * else is normal; refusing it would need an unassign route just to recover.
 */
const assign = (id, assignee) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const updated = {
    ...tasks[index],
    assignee,
    assignedAt: new Date().toISOString(),
  };

  tasks[index] = updated;
  return updated;
};

const _reset = () => {
  tasks = [];
};

module.exports = {
  getAll,
  findById,
  getByStatus,
  paginate,
  getPaginated,
  getStats,
  create,
  update,
  remove,
  completeTask,
  assign,
  _reset,
};
