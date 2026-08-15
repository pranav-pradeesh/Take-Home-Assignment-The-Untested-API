const VALID_STATUSES = ['todo', 'in_progress', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];

/**
 * Rules shared by create and update.
 *
 * Note the `!== undefined` guards. These used to be truthiness checks
 * (`if (body.status)`), which let every falsy value through unvalidated — most
 * importantly `''`, so `{"status": ""}` was stored as-is and produced a task
 * whose status is none of the three valid values. `undefined` is the only value
 * that legitimately means "field not supplied".
 */
const validateOptionalFields = (body) => {
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority)) {
    return `priority must be one of: ${VALID_PRIORITIES.join(', ')}`;
  }
  // null is meaningful for dueDate: it is how a caller says "no deadline".
  if (body.dueDate !== undefined && body.dueDate !== null && isNaN(Date.parse(body.dueDate))) {
    return 'dueDate must be a valid ISO date string';
  }
  return null;
};

const validateCreateTask = (body) => {
  if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
    return 'title is required and must be a non-empty string';
  }
  return validateOptionalFields(body);
};

const validateUpdateTask = (body) => {
  // Unlike create, title is optional here — but if it is sent, it must be usable.
  if (body.title !== undefined && (typeof body.title !== 'string' || body.title.trim() === '')) {
    return 'title must be a non-empty string';
  }
  return validateOptionalFields(body);
};

/**
 * Body rules for PATCH /tasks/:id/assign.
 *
 * `assignee` is a free-text person reference, not a foreign key — there is no
 * user store in this service to check it against. So the rules are the ones
 * that can be enforced honestly here: it must be a string, it must contain
 * something once trimmed, and it must be a plausible length.
 *
 * An empty string is rejected rather than treated as an unassign. Overloading
 * '' to mean "clear this" makes an accidentally blank form field
 * indistinguishable from a deliberate unassign; unassigning deserves its own
 * explicit route.
 */
const MAX_ASSIGNEE_LENGTH = 100;

const validateAssign = (body) => {
  if (typeof body.assignee !== 'string') {
    return 'assignee is required and must be a string';
  }
  if (body.assignee.trim() === '') {
    return 'assignee must not be empty';
  }
  if (body.assignee.trim().length > MAX_ASSIGNEE_LENGTH) {
    return `assignee must be at most ${MAX_ASSIGNEE_LENGTH} characters`;
  }
  return null;
};

module.exports = {
  VALID_STATUSES,
  VALID_PRIORITIES,
  MAX_ASSIGNEE_LENGTH,
  validateCreateTask,
  validateUpdateTask,
  validateAssign,
};
