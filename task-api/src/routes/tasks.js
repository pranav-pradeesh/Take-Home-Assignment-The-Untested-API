const express = require('express');
const router = express.Router();
const taskService = require('../services/taskService');
const {
  VALID_STATUSES,
  validateCreateTask,
  validateUpdateTask,
} = require('../utils/validators');

router.get('/stats', (req, res) => {
  const stats = taskService.getStats();
  res.json(stats);
});

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * Parse a positive-integer query param.
 *
 * `parseInt` is too forgiving here: parseInt('3cats') is 3 and parseInt('abc')
 * is NaN, which the old `|| 1` fallback then turned into a silent default. A
 * client that mistypes a page number should be told, not quietly served page 1.
 *
 * Returns NaN for anything that is not a whole number >= 1.
 */
const parsePositiveInt = (value, fallback) => {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) return NaN;

  const parsed = Number(value);
  return parsed >= 1 ? parsed : NaN;
};

router.get('/', (req, res) => {
  const { status, page, limit } = req.query;

  // A status the API does not recognise is almost always a client typo. Returning
  // an empty list would be indistinguishable from "no tasks match", so 400 instead.
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${VALID_STATUSES.join(', ')}`,
    });
  }

  const isPaginated = page !== undefined || limit !== undefined;
  const pageNum = parsePositiveInt(page, 1);
  const limitNum = parsePositiveInt(limit, DEFAULT_LIMIT);

  if (isPaginated) {
    if (Number.isNaN(pageNum)) {
      return res.status(400).json({ error: 'page must be a whole number >= 1' });
    }
    if (Number.isNaN(limitNum)) {
      return res.status(400).json({ error: 'limit must be a whole number >= 1' });
    }
    // Without a ceiling a single request can drag the entire store over the wire.
    if (limitNum > MAX_LIMIT) {
      return res.status(400).json({ error: `limit must be <= ${MAX_LIMIT}` });
    }
  }

  // Filtering and pagination compose. Previously `status` short-circuited and
  // silently ignored page/limit, so a filtered list could not be paged at all.
  const tasks = status ? taskService.getByStatus(status) : taskService.getAll();

  return res.json(isPaginated ? taskService.paginate(tasks, pageNum, limitNum) : tasks);
});

router.post('/', (req, res) => {
  const error = validateCreateTask(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const task = taskService.create(req.body);
  res.status(201).json(task);
});

router.put('/:id', (req, res) => {
  const error = validateUpdateTask(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const task = taskService.update(req.params.id, req.body);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json(task);
});

router.delete('/:id', (req, res) => {
  const deleted = taskService.remove(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.status(204).send();
});

router.patch('/:id/complete', (req, res) => {
  const task = taskService.completeTask(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json(task);
});

module.exports = router;
