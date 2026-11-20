import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

const cache = new Map<string, DB>();

export function dataDir(): string {
  return path.resolve(process.env.FLASHBACK_DATA_DIR || './data');
}

function migrate(db: DB) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const dir = path.join(process.cwd(), 'db', 'migrations');
  const applied = new Set((db.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(f, Date.now());
    })();
  }
}

/** Returns the process-wide SQLite connection (one per data dir). Not production-grade horizontal persistence. */
export function db(): DB {
  const dir = dataDir();
  const hit = cache.get(dir);
  if (hit) return hit;
  fs.mkdirSync(dir, { recursive: true });
  const conn = new Database(path.join(dir, 'flashback.db'));
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.pragma('busy_timeout = 5000');
  migrate(conn);
  cache.set(dir, conn);
  return conn;
}

export function closeDb() {
  for (const c of cache.values()) c.close();
  cache.clear();
}
