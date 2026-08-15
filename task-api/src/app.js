const express = require('express');
const taskRoutes = require('./routes/tasks');

const app = express();

app.use(express.json());
app.use('/tasks', taskRoutes);

// Nothing above matched. Express's built-in fallback returns an HTML page, which
// breaks any client that assumes a JSON body on every response from a JSON API.
app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
app.use((err, req, res, next) => {
  // express.json() throws this when the body is not parseable. That is the
  // client's mistake, not a server fault; it used to fall through to the 500
  // branch below and report an internal error for a malformed request.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }

  // Other body-parser errors (payload too large, unsupported charset) arrive
  // with a 4xx already attached. Pass it through rather than masking it as 500.
  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err.stack);
  return res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Task API running on port ${PORT}`);
  });
}

module.exports = app;
