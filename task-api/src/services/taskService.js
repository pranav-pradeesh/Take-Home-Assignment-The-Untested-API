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
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  return task;
};

const update = (id, fields) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const updated = { ...tasks[index], ...fields };
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
  const task = findById(id);
  if (!task) return null;

  const updated = {
    ...task,
    priority: 'medium',
    status: 'done',
    completedAt: new Date().toISOString(),
  };

  const index = tasks.findIndex((t) => t.id === id);
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
  _reset,
};
