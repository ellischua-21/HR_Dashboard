require('dotenv').config();

const { initializeDatabase, pool } = require('../server/db/database');

initializeDatabase()
  .then(() => {
    console.log('MySQL tables and default lookup values are ready.');
  })
  .catch((error) => {
    console.error('Database setup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
