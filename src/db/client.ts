import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

function resolveDbPath(): string {
  const raw = process.env.DATABASE_URL?.replace(/^file:/, '') ?? 'buildr.db';
  const abs = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  return abs;
}

const sqlite = new Database(resolveDbPath());
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { schema };
