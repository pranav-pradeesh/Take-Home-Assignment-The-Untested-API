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

module.exports = {
  VALID_STATUSES,
  VALID_PRIORITIES,
  validateCreateTask,
  validateUpdateTask,
};
