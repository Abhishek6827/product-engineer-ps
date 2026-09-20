// server/index.js — Entry point
//
// Initializes the database, recovers stale runs from any previous crash,
// then starts the HTTP server.

import { initDb, recoverStaleRuns } from './db.js';
import { createApp } from './app.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

// 1. Initialize SQLite database (creates tables if needed)
initDb();

// 2. Startup recovery: mark any runs left in running/queued as interrupted
const recovered = recoverStaleRuns();
if (recovered > 0) {
  console.log(`⚠  Recovered ${recovered} stale run(s) from previous crash → marked as 'interrupted'`);
}

// 3. Create and start Express app
const app = createApp();
const server = app.listen(PORT, () => {
  console.log(`🚀 Resumable Realtime Conversation server running at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close();
  process.exit(0);
});
