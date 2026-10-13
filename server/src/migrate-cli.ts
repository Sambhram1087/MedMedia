import { runMigrations } from './migrate';
import { pool } from './db';

runMigrations()
  .then(() => console.log('Migrations up to date'))
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
