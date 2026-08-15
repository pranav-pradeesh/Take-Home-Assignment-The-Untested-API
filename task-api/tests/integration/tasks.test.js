/**
 * Integration tests for the /tasks routes, driven through Express with Supertest.
 *
 * These assert on observable HTTP behaviour — status code and response body —
 * rather than on how the service happens to be wired underneath.
 */
const request = require('supertest');
const app = require('../../src/app');
const taskService = require('../../src/services/taskService');

const PAST = '2020-01-01T00:00:00.000Z';
const FUTURE = '2999-01-01T00:00:00.000Z';

// Helper: create a task through the API so tests exercise the real path in.
const createTask = async (body = {}) => {
  const res = await request(app)
    .post('/tasks')
    .send({ title: 'Test task', ...body });
  return res.body;
};

beforeEach(() => {
  taskService._reset();
});

describe('POST /tasks', () => {
  it('creates a task and returns 201 with the created resource', async () => {
    const res = await request(app).post('/tasks').send({ title: 'Buy milk' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Buy milk',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      completedAt: null,
    });
    expect(res.body.id).toEqual(expect.any(String));
  });

  it('honours every optional field', async () => {
    const res = await request(app).post('/tasks').send({
      title: 'Ship',
      description: 'the thing',
      status: 'in_progress',
      priority: 'high',
      dueDate: FUTURE,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      description: 'the thing',
      status: 'in_progress',
      priority: 'high',
      dueDate: FUTURE,
    });
  });

  it('rejects a missing title with 400', async () => {
    const res = await request(app).post('/tasks').send({ description: 'no title' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/);
  });

  it('rejects a whitespace-only title with 400', async () => {
    const res = await request(app).post('/tasks').send({ title: '   ' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown status with 400', async () => {
    const res = await request(app).post('/tasks').send({ title: 'a', status: 'archived' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/);
  });

  it('rejects an unknown priority with 400', async () => {
    const res = await request(app).post('/tasks').send({ title: 'a', priority: 'urgent' });
    expect(res.status).toBe(400);
  });

  it('rejects an unparseable dueDate with 400', async () => {
    const res = await request(app).post('/tasks').send({ title: 'a', dueDate: 'whenever' });
    expect(res.status).toBe(400);
  });

  it('does not persist a rejected task', async () => {
    await request(app).post('/tasks').send({ title: '' });

    const res = await request(app).get('/tasks');
    expect(res.body).toEqual([]);
  });

  // Edge case: a client-owned id in the body must not become the task's id.
  it('ignores a client-supplied id', async () => {
    const res = await request(app).post('/tasks').send({ title: 'a', id: 'client-chosen' });
    expect(res.body.id).not.toBe('client-chosen');
  });
});

describe('GET /tasks', () => {
  it('returns an empty array when there are no tasks', async () => {
    const res = await request(app).get('/tasks');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns every task', async () => {
    await createTask({ title: 'one' });
    await createTask({ title: 'two' });

    const res = await request(app).get('/tasks');

    expect(res.status).toBe(200);
    expect(res.body.map((t) => t.title)).toEqual(['one', 'two']);
  });
});

describe('GET /tasks?status=', () => {
  beforeEach(async () => {
    await createTask({ title: 'a', status: 'todo' });
    await createTask({ title: 'b', status: 'in_progress' });
    await createTask({ title: 'c', status: 'done' });
  });

  it('filters by exact status', async () => {
    const res = await request(app).get('/tasks?status=todo');

    expect(res.status).toBe(200);
    expect(res.body.map((t) => t.title)).toEqual(['a']);
  });

  it('filters on in_progress without dragging in other statuses', async () => {
    const res = await request(app).get('/tasks?status=in_progress');
    expect(res.body.map((t) => t.title)).toEqual(['b']);
  });

  // Edge case: 'o' appears inside todo, in_progress and done. A substring match
  // would return all three, which is the difference between a filter and a no-op.
  // It is not a valid status either, so the request is rejected outright.
  it('does not treat a substring as a wildcard', async () => {
    const res = await request(app).get('/tasks?status=o');

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body)).toBe(false);
  });

  it('rejects a status outside the allowed set with 400', async () => {
    const res = await request(app).get('/tasks?status=archived');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/);
  });
});

describe('GET /tasks?page=&limit=', () => {
  beforeEach(async () => {
    for (let i = 1; i <= 25; i += 1) {
      await createTask({ title: `Task ${i}` });
    }
  });

  it('returns the first page for page=1', async () => {
    const res = await request(app).get('/tasks?page=1&limit=10');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(10);
    expect(res.body[0].title).toBe('Task 1');
  });

  it('returns the second page for page=2', async () => {
    const res = await request(app).get('/tasks?page=2&limit=10');
    expect(res.body[0].title).toBe('Task 11');
  });

  it('defaults to page 1 when only limit is supplied', async () => {
    const res = await request(app).get('/tasks?limit=5');

    expect(res.body).toHaveLength(5);
    expect(res.body[0].title).toBe('Task 1');
  });

  it('returns an empty page past the end of the list', async () => {
    const res = await request(app).get('/tasks?page=99&limit=10');
    expect(res.body).toEqual([]);
  });

  it('rejects a non-numeric page with 400', async () => {
    const res = await request(app).get('/tasks?page=abc&limit=10');
    expect(res.status).toBe(400);
  });

  it('rejects page=0 with 400 because pages are 1-based', async () => {
    const res = await request(app).get('/tasks?page=0&limit=10');
    expect(res.status).toBe(400);
  });

  it('rejects a negative limit with 400', async () => {
    const res = await request(app).get('/tasks?page=1&limit=-5');
    expect(res.status).toBe(400);
  });

  it('rejects an oversized limit with 400 so one request cannot pull the whole store', async () => {
    const res = await request(app).get('/tasks?page=1&limit=100000');
    expect(res.status).toBe(400);
  });

  it('applies status and pagination together', async () => {
    await createTask({ title: 'done 1', status: 'done' });
    await createTask({ title: 'done 2', status: 'done' });

    const res = await request(app).get('/tasks?status=done&page=1&limit=1');

    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('done 1');
  });
});

describe('GET /tasks/stats', () => {
  it('returns zeroes for an empty store', async () => {
    const res = await request(app).get('/tasks/stats');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  it('counts by status and flags overdue work', async () => {
    await createTask({ title: 'a', status: 'todo', dueDate: PAST });
    await createTask({ title: 'b', status: 'todo', dueDate: FUTURE });
    await createTask({ title: 'c', status: 'in_progress' });
    await createTask({ title: 'd', status: 'done', dueDate: PAST });

    const res = await request(app).get('/tasks/stats');

    expect(res.body).toEqual({ todo: 2, in_progress: 1, done: 1, overdue: 1 });
  });

  // /stats is a literal path that has to win over any /:id-style route.
  it('is not shadowed by a parameterised route', async () => {
    const res = await request(app).get('/tasks/stats');
    expect(res.body).toHaveProperty('overdue');
  });
});

describe('PUT /tasks/:id', () => {
  it('updates the supplied fields and returns the task', async () => {
    const task = await createTask({ title: 'old', description: 'keep' });

    const res = await request(app).put(`/tasks/${task.id}`).send({ title: 'new' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('new');
    expect(res.body.description).toBe('keep');
  });

  it('persists the change', async () => {
    const task = await createTask({ title: 'old' });
    await request(app).put(`/tasks/${task.id}`).send({ title: 'new' });

    const res = await request(app).get('/tasks');
    expect(res.body[0].title).toBe('new');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).put('/tasks/does-not-exist').send({ title: 'new' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Task not found');
  });

  it('rejects an invalid status with 400', async () => {
    const task = await createTask();

    const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'archived' });

    expect(res.status).toBe(400);
  });

  it('validates the body before looking the task up', async () => {
    const res = await request(app).put('/tasks/does-not-exist').send({ title: '' });
    expect(res.status).toBe(400);
  });

  // Edge case: mass assignment. Server-owned fields must be immutable from the
  // outside, otherwise a task can be moved to an id its own URL no longer serves.
  it('ignores a client attempt to rewrite the id', async () => {
    const task = await createTask();

    const res = await request(app).put(`/tasks/${task.id}`).send({ id: 'hijacked' });

    expect(res.body.id).toBe(task.id);
    expect((await request(app).put(`/tasks/${task.id}`).send({ title: 'still here' })).status).toBe(200);
  });

  it('ignores a client attempt to rewrite createdAt', async () => {
    const task = await createTask();

    const res = await request(app).put(`/tasks/${task.id}`).send({ createdAt: PAST });

    expect(res.body.createdAt).toBe(task.createdAt);
  });

  it('does not store unknown fields', async () => {
    const task = await createTask();

    const res = await request(app).put(`/tasks/${task.id}`).send({ role: 'admin' });

    expect(res.body.role).toBeUndefined();
  });

  it('stamps completedAt when the status is moved to done', async () => {
    const task = await createTask();

    const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'done' });

    expect(Date.parse(res.body.completedAt)).not.toBeNaN();
  });

  it('clears completedAt when a done task is reopened', async () => {
    const task = await createTask();
    await request(app).put(`/tasks/${task.id}`).send({ status: 'done' });

    const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'todo' });

    expect(res.body.completedAt).toBeNull();
  });
});

describe('DELETE /tasks/:id', () => {
  it('deletes the task and returns 204 with no body', async () => {
    const task = await createTask();

    const res = await request(app).delete(`/tasks/${task.id}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('actually removes it from the list', async () => {
    const task = await createTask();
    await request(app).delete(`/tasks/${task.id}`);

    const res = await request(app).get('/tasks');
    expect(res.body).toEqual([]);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).delete('/tasks/nope');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Task not found');
  });

  it('returns 404 on a second delete of the same task', async () => {
    const task = await createTask();
    await request(app).delete(`/tasks/${task.id}`);

    const res = await request(app).delete(`/tasks/${task.id}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  it('marks the task done and stamps completedAt', async () => {
    const task = await createTask({ status: 'todo' });

    const res = await request(app).patch(`/tasks/${task.id}/complete`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(Date.parse(res.body.completedAt)).not.toBeNaN();
  });

  // Completing a task is a status change. It should not quietly rewrite other
  // user-owned fields.
  it('leaves priority untouched', async () => {
    const task = await createTask({ priority: 'high' });

    const res = await request(app).patch(`/tasks/${task.id}/complete`);

    expect(res.body.priority).toBe('high');
  });

  it('leaves title, description and dueDate untouched', async () => {
    const task = await createTask({ title: 't', description: 'd', dueDate: FUTURE });

    const res = await request(app).patch(`/tasks/${task.id}/complete`);

    expect(res.body).toMatchObject({ title: 't', description: 'd', dueDate: FUTURE });
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).patch('/tasks/nope/complete');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Task not found');
  });

  it('is idempotent — completing twice keeps the first completion time', async () => {
    const task = await createTask();
    const first = await request(app).patch(`/tasks/${task.id}/complete`);

    const second = await request(app).patch(`/tasks/${task.id}/complete`);

    expect(second.status).toBe(200);
    expect(second.body.completedAt).toBe(first.body.completedAt);
  });

  it('removes the task from the overdue count', async () => {
    const task = await createTask({ dueDate: PAST });
    expect((await request(app).get('/tasks/stats')).body.overdue).toBe(1);

    await request(app).patch(`/tasks/${task.id}/complete`);

    expect((await request(app).get('/tasks/stats')).body.overdue).toBe(0);
  });
});

describe('error handling', () => {
  // A body the server cannot parse is the client's mistake, not a server fault.
  it('returns 400, not 500, for malformed JSON', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": "unclosed');

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });

  // body-parser attaches a 4xx to this. Passing it through beats reporting 500,
  // which would tell the client to retry a request that can never succeed.
  it('returns the parser status, not 500, when the body is too large', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'a', description: 'x'.repeat(200 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body.error).toEqual(expect.any(String));
  });

  it('returns a JSON 404 for an unknown route', async () => {
    const res = await request(app).get('/not-a-route');

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual(expect.any(String));
  });

  it('returns a JSON 404 for a known path with the wrong method', async () => {
    const res = await request(app).post('/tasks/stats');
    expect(res.status).toBe(404);
  });
});
