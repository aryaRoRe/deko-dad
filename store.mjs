import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const migrations = ['0000_deko_core.sql', '0001_telegram.sql'];
const schema = migrations.map(file => readFileSync(new URL('./drizzle/' + file, import.meta.url), 'utf8')).join('\n');

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path, { timeout: 4000 });
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(schema);
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...parameters) {
          return {
            first: () => statement.get(...parameters) ?? null,
            all: () => ({ results: statement.all(...parameters) }),
            run: () => ({ meta: { changes: Number(statement.run(...parameters).changes) } }),
          };
        },
      };
    },
    batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => db.close(),
  };
}
