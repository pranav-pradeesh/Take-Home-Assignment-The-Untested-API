/**
 * Serverless entry point for the Vercel deployment.
 *
 * Vercel invokes the exported handler per request instead of running a
 * long-lived server, so this re-exports the Express app rather than calling
 * app.listen(). `npm start` still uses src/app.js directly for local runs.
 *
 * Consequence worth knowing when poking at the live URL: the in-memory store
 * lives inside one warm instance. Requests made close together share state, but
 * a cold start or a second instance begins from an empty store. That is a
 * property of putting an in-memory store on serverless, not a bug in the API —
 * see NOTES.md, "Where does the data actually live?".
 */
module.exports = require('../src/app');
