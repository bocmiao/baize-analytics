import { createPool, migrate } from '../src/server/db.js';
const pool=createPool();
try {await migrate(pool); console.log('Database migrations applied');} finally {await pool.end();}
