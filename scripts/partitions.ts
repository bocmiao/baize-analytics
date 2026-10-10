import { createPool,migrate } from '../src/server/db.js';
import { preparePartitions,dropEmptyHistoricalPartitions } from '../src/server/partitions.js';
const pool=createPool();try{await migrate(pool);console.log(JSON.stringify(await preparePartitions(pool)));console.log(JSON.stringify(await dropEmptyHistoricalPartitions(pool)));}finally{await pool.end();}
