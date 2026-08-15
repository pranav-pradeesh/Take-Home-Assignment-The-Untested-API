/**
 * Unit tests for the request-body validators.
 *
 * Contract: return null when the body is acceptable, or a human-readable string
 * describing the first problem found.
 */
const { validateCreateTask, validateUpdateTask } = require('../../src/utils/validators');

describe('validateCreateTask', () => {
  it('accepts a body with only a title', () => {
    expect(validateCreateTask({ title: 'a' })).toBeNull();
  });

  it('accepts a fully populated body', () => {
    const error = validateCreateTask({
      title: 'a',
      description: 'd',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-01-01T00:00:00.000Z',
    });
    expect(error).toBeNull();
  });

  it.each([
    ['missing', {}],
    ['null', { title: null }],
    ['empty', { title: '' }],
    ['whitespace only', { title: '   ' }],
    ['not a string', { title: 42 }],
  ])('rejects a title that is %s', (_label, body) => {
    expect(validateCreateTask(body)).toMatch(/title/);
  });

  it('rejects an unknown status', () => {
    expect(validateCreateTask({ title: 'a', status: 'archived' })).toMatch(/status/);
  });

  it('rejects an unknown priority', () => {
    expect(validateCreateTask({ title: 'a', priority: 'urgent' })).toMatch(/priority/);
  });

  it('rejects an unparseable dueDate', () => {
    expect(validateCreateTask({ title: 'a', dueDate: 'next tuesday-ish' })).toMatch(/dueDate/);
  });

  it('accepts a null dueDate, which means "no deadline"', () => {
    expect(validateCreateTask({ title: 'a', dueDate: null })).toBeNull();
  });

  // Edge case: '' is falsy, so a naive `if (body.status)` guard waves it through
  // and the task ends up with a status that is not one of the three valid values.
  it('rejects an empty-string status rather than treating it as absent', () => {
    expect(validateCreateTask({ title: 'a', status: '' })).toMatch(/status/);
  });

  it('rejects an empty-string priority rather than treating it as absent', () => {
    expect(validateCreateTask({ title: 'a', priority: '' })).toMatch(/priority/);
  });

  it('rejects an empty-string dueDate rather than treating it as absent', () => {
    expect(validateCreateTask({ title: 'a', dueDate: '' })).toMatch(/dueDate/);
  });
});

describe('validateUpdateTask', () => {
  it('accepts an empty body (nothing to change)', () => {
    expect(validateUpdateTask({})).toBeNull();
  });

  it('accepts a partial update', () => {
    expect(validateUpdateTask({ status: 'done' })).toBeNull();
  });

  it.each([
    ['empty', { title: '' }],
    ['whitespace only', { title: '   ' }],
    ['not a string', { title: [] }],
    ['null', { title: null }],
  ])('rejects a title that is %s when present', (_label, body) => {
    expect(validateUpdateTask(body)).toMatch(/title/);
  });

  it('rejects an unknown status', () => {
    expect(validateUpdateTask({ status: 'archived' })).toMatch(/status/);
  });

  it('rejects an unknown priority', () => {
    expect(validateUpdateTask({ priority: 'urgent' })).toMatch(/priority/);
  });

  it('rejects an unparseable dueDate', () => {
    expect(validateUpdateTask({ dueDate: 'soon' })).toMatch(/dueDate/);
  });

  it('accepts a null dueDate, which clears the deadline', () => {
    expect(validateUpdateTask({ dueDate: null })).toBeNull();
  });

  it('rejects an empty-string status rather than treating it as absent', () => {
    expect(validateUpdateTask({ status: '' })).toMatch(/status/);
  });

  it('rejects an empty-string priority rather than treating it as absent', () => {
    expect(validateUpdateTask({ priority: '' })).toMatch(/priority/);
  });

  it('rejects an empty-string dueDate rather than treating it as absent', () => {
    expect(validateUpdateTask({ dueDate: '' })).toMatch(/dueDate/);
  });
});
