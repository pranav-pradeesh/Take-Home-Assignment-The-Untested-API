/**
 * Integration tests for PATCH /tasks/:id/assign.
 *
 * Written before the implementation, so the assertions here are the spec for
 * the decisions recorded in NOTES.md — in particular: reassignment is allowed,
 * an empty assignee is a client error rather than an unassign, and validation
 * runs before the task lookup.
 */
const request = require('supertest');
const app = require('../../src/app');
const taskService = require('../../src/services/taskService');

const createTask = async (body = {}) => {
  const res = await request(app)
    .post('/tasks')
    .send({ title: 'Test task', ...body });
  return res.body;
};

const assign = (id, body) => request(app).patch(`/tasks/${id}/assign`).send(body);

beforeEach(() => {
  taskService._reset();
});

describe('PATCH /tasks/:id/assign — happy path', () => {
  it('stores the assignee and returns the updated task', async () => {
    const task = await createTask();

    const res = await assign(task.id, { assignee: 'Pranav' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: task.id, assignee: 'Pranav' });
  });

  it('persists the assignment', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Pranav' });

    const res = await request(app).get('/tasks');

    expect(res.body[0].assignee).toBe('Pranav');
  });

  it('records when the assignment happened', async () => {
    const task = await createTask();

    const res = await assign(task.id, { assignee: 'Pranav' });

    expect(Date.parse(res.body.assignedAt)).not.toBeNaN();
  });

  it('trims surrounding whitespace off the name', async () => {
    const task = await createTask();

    const res = await assign(task.id, { assignee: '  Pranav  ' });

    expect(res.body.assignee).toBe('Pranav');
  });

  it('leaves the rest of the task untouched', async () => {
    const task = await createTask({ title: 't', priority: 'high', status: 'in_progress' });

    const res = await assign(task.id, { assignee: 'Pranav' });

    expect(res.body).toMatchObject({
      title: 't',
      priority: 'high',
      status: 'in_progress',
      createdAt: task.createdAt,
    });
  });

  it('accepts a name at the maximum length', async () => {
    const task = await createTask();

    const res = await assign(task.id, { assignee: 'a'.repeat(100) });

    expect(res.status).toBe(200);
  });
});

describe('PATCH /tasks/:id/assign — reassignment', () => {
  // Decision: assignment is mutable. Handing a task to someone else is a normal
  // operation, so this returns 200 rather than 409. See NOTES.md.
  it('allows an already-assigned task to be reassigned', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'First' });

    const res = await assign(task.id, { assignee: 'Second' });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Second');
  });

  it('moves assignedAt forward on reassignment', async () => {
    const task = await createTask();
    const first = await assign(task.id, { assignee: 'First' });

    // Timestamps are millisecond-resolution; make sure the clock has moved.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await assign(task.id, { assignee: 'Second' });

    expect(Date.parse(second.body.assignedAt)).toBeGreaterThan(Date.parse(first.body.assignedAt));
  });

  it('is happy to reassign to the same person', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Same' });

    const res = await assign(task.id, { assignee: 'Same' });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Same');
  });
});

describe('PATCH /tasks/:id/assign — validation', () => {
  it('returns 404 for an unknown task', async () => {
    const res = await assign('does-not-exist', { assignee: 'Pranav' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Task not found');
  });

  it('rejects a missing assignee with 400', async () => {
    const task = await createTask();

    const res = await assign(task.id, {});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/assignee/);
  });

  // Decision: '' is not an unassign. Overloading empty string to mean "clear it"
  // makes an accidental empty form field indistinguishable from a deliberate
  // unassign, so it is rejected. See NOTES.md.
  it('rejects an empty assignee with 400 rather than treating it as unassign', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Pranav' });

    const res = await assign(task.id, { assignee: '' });

    expect(res.status).toBe(400);
  });

  it('leaves the existing assignee in place when a request is rejected', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Pranav' });

    await assign(task.id, { assignee: '' });

    const res = await request(app).get('/tasks');
    expect(res.body[0].assignee).toBe('Pranav');
  });

  it('rejects a whitespace-only assignee with 400', async () => {
    const task = await createTask();

    const res = await assign(task.id, { assignee: '   ' });

    expect(res.status).toBe(400);
  });

  it.each([
    ['a number', 42],
    ['null', null],
    ['an array', ['Pranav']],
    ['an object', { name: 'Pranav' }],
    ['a boolean', true],
  ])('rejects an assignee that is %s with 400', async (_label, assignee) => {
    const task = await createTask();

    const res = await assign(task.id, { assignee });

    expect(res.status).toBe(400);
  });

  it('rejects a name longer than the maximum with 400', async () => {
    const task = await createTask();

    const res = await assign(task.id, { assignee: 'a'.repeat(101) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/100/);
  });

  // Decision: the body is checked before the store is touched, so a request that
  // is malformed gets the same answer whether or not the task exists.
  it('reports a bad body as 400 even when the task does not exist', async () => {
    const res = await assign('does-not-exist', { assignee: '' });

    expect(res.status).toBe(400);
  });

  it('rejects a malformed JSON body with 400', async () => {
    const task = await createTask();

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .set('Content-Type', 'application/json')
      .send('{"assignee": ');

    expect(res.status).toBe(400);
  });
});

describe('assignee field on the task shape', () => {
  it('starts as null on a newly created task', async () => {
    const task = await createTask();

    expect(task.assignee).toBeNull();
    expect(task.assignedAt).toBeNull();
  });

  // Decision: assignment has one entry point. Allowing PUT to set it too would
  // bypass the trimming and length rules above.
  it('cannot be set through PUT /tasks/:id', async () => {
    const task = await createTask();

    const res = await request(app).put(`/tasks/${task.id}`).send({ assignee: 'Sneaky' });

    expect(res.body.assignee).toBeNull();
  });

  it('survives a status update', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Pranav' });

    const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'done' });

    expect(res.body.assignee).toBe('Pranav');
  });

  it('survives completion', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Pranav' });

    const res = await request(app).patch(`/tasks/${task.id}/complete`);

    expect(res.body.assignee).toBe('Pranav');
  });
});
