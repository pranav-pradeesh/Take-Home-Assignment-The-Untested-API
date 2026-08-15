/**
 * Unit tests for the in-memory task store.
 *
 * These hit taskService directly (no HTTP) so failures point at the data layer
 * rather than at routing/validation. The store is module-level state, so every
 * test starts from _reset().
 */
const taskService = require('../../src/services/taskService');

// Fixed dates keep the overdue maths deterministic — no "flaky at midnight" tests.
const PAST = '2020-01-01T00:00:00.000Z';
const FUTURE = '2999-01-01T00:00:00.000Z';

beforeEach(() => {
  taskService._reset();
});

describe('create', () => {
  it('applies the documented defaults when only a title is given', () => {
    const task = taskService.create({ title: 'Write tests' });

    expect(task).toMatchObject({
      title: 'Write tests',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      completedAt: null,
    });
    expect(task.id).toEqual(expect.any(String));
    expect(Date.parse(task.createdAt)).not.toBeNaN();
  });

  it('keeps caller-supplied values instead of the defaults', () => {
    const task = taskService.create({
      title: 'Ship it',
      description: 'to prod',
      status: 'in_progress',
      priority: 'high',
      dueDate: FUTURE,
    });

    expect(task).toMatchObject({
      description: 'to prod',
      status: 'in_progress',
      priority: 'high',
      dueDate: FUTURE,
    });
  });

  it('persists the task in the store', () => {
    const task = taskService.create({ title: 'a' });
    expect(taskService.getAll()).toHaveLength(1);
    expect(taskService.findById(task.id)).toMatchObject({ id: task.id });
  });

  it('gives every task a distinct id', () => {
    const ids = [1, 2, 3].map((n) => taskService.create({ title: `t${n}` }).id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('getAll', () => {
  it('returns an empty list on a fresh store', () => {
    expect(taskService.getAll()).toEqual([]);
  });

  it('hands back a copy, so callers cannot append into the store', () => {
    taskService.create({ title: 'a' });

    const returned = taskService.getAll();
    returned.push({ id: 'injected' });

    expect(taskService.getAll()).toHaveLength(1);
  });
});

describe('findById', () => {
  it('finds an existing task', () => {
    const created = taskService.create({ title: 'a' });
    expect(taskService.findById(created.id).id).toBe(created.id);
  });

  it('returns undefined for an unknown id', () => {
    expect(taskService.findById('nope')).toBeUndefined();
  });
});

describe('getByStatus', () => {
  beforeEach(() => {
    taskService.create({ title: 'a', status: 'todo' });
    taskService.create({ title: 'b', status: 'in_progress' });
    taskService.create({ title: 'c', status: 'done' });
    taskService.create({ title: 'd', status: 'todo' });
  });

  it('returns only tasks whose status matches exactly', () => {
    const todo = taskService.getByStatus('todo');
    expect(todo).toHaveLength(2);
    expect(todo.every((t) => t.status === 'todo')).toBe(true);
  });

  // Edge case: a substring of a real status must not behave like a wildcard.
  // 'o' is a substring of todo / in_progress / done.
  it('does not match on substrings', () => {
    expect(taskService.getByStatus('o')).toEqual([]);
  });

  it('does not treat "progress" as "in_progress"', () => {
    expect(taskService.getByStatus('progress')).toEqual([]);
  });

  it('returns an empty list for a status nothing uses', () => {
    expect(taskService.getByStatus('archived')).toEqual([]);
  });
});

describe('getPaginated', () => {
  beforeEach(() => {
    for (let i = 1; i <= 25; i += 1) {
      taskService.create({ title: `Task ${i}` });
    }
  });

  // page is 1-based in the public API (`?page=1` is documented as the first page),
  // so page 1 must return the first slice, not skip it.
  it('returns the first slice for page 1', () => {
    const page = taskService.getPaginated(1, 10);
    expect(page).toHaveLength(10);
    expect(page[0].title).toBe('Task 1');
    expect(page[9].title).toBe('Task 10');
  });

  it('returns the second slice for page 2', () => {
    const page = taskService.getPaginated(2, 10);
    expect(page[0].title).toBe('Task 11');
    expect(page[9].title).toBe('Task 20');
  });

  it('returns a short final page', () => {
    const page = taskService.getPaginated(3, 10);
    expect(page).toHaveLength(5);
    expect(page[0].title).toBe('Task 21');
  });

  it('returns an empty list past the end', () => {
    expect(taskService.getPaginated(99, 10)).toEqual([]);
  });

  it('never overlaps consecutive pages', () => {
    const first = taskService.getPaginated(1, 10).map((t) => t.id);
    const second = taskService.getPaginated(2, 10).map((t) => t.id);
    expect(first.filter((id) => second.includes(id))).toEqual([]);
  });
});

describe('getStats', () => {
  it('returns zeroes for an empty store', () => {
    expect(taskService.getStats()).toEqual({
      todo: 0,
      in_progress: 0,
      done: 0,
      overdue: 0,
    });
  });

  it('counts tasks by status', () => {
    taskService.create({ title: 'a', status: 'todo' });
    taskService.create({ title: 'b', status: 'todo' });
    taskService.create({ title: 'c', status: 'in_progress' });
    taskService.create({ title: 'd', status: 'done' });

    expect(taskService.getStats()).toMatchObject({ todo: 2, in_progress: 1, done: 1 });
  });

  it('counts a past dueDate on an unfinished task as overdue', () => {
    taskService.create({ title: 'late', status: 'todo', dueDate: PAST });
    expect(taskService.getStats().overdue).toBe(1);
  });

  it('does not count a future dueDate as overdue', () => {
    taskService.create({ title: 'soon', status: 'todo', dueDate: FUTURE });
    expect(taskService.getStats().overdue).toBe(0);
  });

  it('does not count a finished task as overdue even if it was late', () => {
    taskService.create({ title: 'late but done', status: 'done', dueDate: PAST });
    expect(taskService.getStats().overdue).toBe(0);
  });

  it('does not count a task with no dueDate as overdue', () => {
    taskService.create({ title: 'no deadline', status: 'todo' });
    expect(taskService.getStats().overdue).toBe(0);
  });
});

describe('update', () => {
  it('merges the supplied fields and leaves the rest alone', () => {
    const task = taskService.create({ title: 'old', description: 'keep me' });

    const updated = taskService.update(task.id, { title: 'new' });

    expect(updated.title).toBe('new');
    expect(updated.description).toBe('keep me');
  });

  it('persists the update in the store', () => {
    const task = taskService.create({ title: 'old' });
    taskService.update(task.id, { title: 'new' });
    expect(taskService.findById(task.id).title).toBe('new');
  });

  it('returns null for an unknown id', () => {
    expect(taskService.update('nope', { title: 'x' })).toBeNull();
  });

  // Edge case: id and createdAt are server-owned. A client that sends them in the
  // body must not be able to rewrite them — an id rewrite would strand the task at
  // a URL that no longer resolves.
  it('ignores attempts to overwrite the id', () => {
    const task = taskService.create({ title: 'a' });

    const updated = taskService.update(task.id, { id: 'hijacked', title: 'b' });

    expect(updated.id).toBe(task.id);
    expect(taskService.findById(task.id)).toBeDefined();
    expect(taskService.findById('hijacked')).toBeUndefined();
  });

  it('ignores attempts to overwrite createdAt', () => {
    const task = taskService.create({ title: 'a' });
    const updated = taskService.update(task.id, { createdAt: '1999-01-01T00:00:00.000Z' });
    expect(updated.createdAt).toBe(task.createdAt);
  });

  it('drops unknown fields instead of storing them', () => {
    const task = taskService.create({ title: 'a' });
    const updated = taskService.update(task.id, { isAdmin: true });
    expect(updated.isAdmin).toBeUndefined();
  });

  // completedAt is derived from status; it should never be settable on its own.
  it('stamps completedAt when a task is moved to done', () => {
    const task = taskService.create({ title: 'a', status: 'todo' });

    const updated = taskService.update(task.id, { status: 'done' });

    expect(updated.status).toBe('done');
    expect(Date.parse(updated.completedAt)).not.toBeNaN();
  });

  it('clears completedAt when a done task is reopened', () => {
    const task = taskService.create({ title: 'a' });
    taskService.update(task.id, { status: 'done' });

    const reopened = taskService.update(task.id, { status: 'in_progress' });

    expect(reopened.completedAt).toBeNull();
  });

  it('does not let a client set completedAt directly', () => {
    const task = taskService.create({ title: 'a' });
    const updated = taskService.update(task.id, { completedAt: '2020-05-05T00:00:00.000Z' });
    expect(updated.completedAt).toBeNull();
  });
});

describe('remove', () => {
  it('deletes the task and reports success', () => {
    const task = taskService.create({ title: 'a' });

    expect(taskService.remove(task.id)).toBe(true);
    expect(taskService.getAll()).toEqual([]);
  });

  it('returns false for an unknown id', () => {
    expect(taskService.remove('nope')).toBe(false);
  });

  it('only removes the requested task', () => {
    const keep = taskService.create({ title: 'keep' });
    const drop = taskService.create({ title: 'drop' });

    taskService.remove(drop.id);

    expect(taskService.getAll().map((t) => t.id)).toEqual([keep.id]);
  });
});

describe('completeTask', () => {
  it('sets status to done and stamps completedAt', () => {
    const task = taskService.create({ title: 'a', status: 'todo' });

    const completed = taskService.completeTask(task.id);

    expect(completed.status).toBe('done');
    expect(Date.parse(completed.completedAt)).not.toBeNaN();
  });

  // Completing a task says nothing about how important it was. Priority is
  // user-owned data and must survive the transition.
  it('preserves the task priority', () => {
    const task = taskService.create({ title: 'urgent', priority: 'high' });

    expect(taskService.completeTask(task.id).priority).toBe('high');
  });

  it('preserves the rest of the task', () => {
    const task = taskService.create({ title: 'a', description: 'd', dueDate: FUTURE });

    const completed = taskService.completeTask(task.id);

    expect(completed).toMatchObject({
      id: task.id,
      title: 'a',
      description: 'd',
      dueDate: FUTURE,
      createdAt: task.createdAt,
    });
  });

  it('returns null for an unknown id', () => {
    expect(taskService.completeTask('nope')).toBeNull();
  });

  // Edge case: completing twice should be a no-op, not a rewrite of history.
  it('keeps the original completion time when completed twice', () => {
    const task = taskService.create({ title: 'a' });
    const first = taskService.completeTask(task.id);

    const second = taskService.completeTask(task.id);

    expect(second.completedAt).toBe(first.completedAt);
  });
});

describe('_reset', () => {
  it('empties the store', () => {
    taskService.create({ title: 'a' });
    taskService._reset();
    expect(taskService.getAll()).toEqual([]);
  });
});
