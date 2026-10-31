import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class Store {
  constructor(dir) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(dir, 'nullo.sqlite'));
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, delivery TEXT UNIQUE NOT NULL, team TEXT NOT NULL,
        owner TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL,
        payload TEXT, created INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS aliens (
        team TEXT NOT NULL, owner TEXT NOT NULL, seed TEXT NOT NULL,
        created INTEGER NOT NULL, PRIMARY KEY(team, owner, seed)
      );
      CREATE TABLE IF NOT EXISTS active (
        team TEXT NOT NULL, owner TEXT NOT NULL, seed TEXT NOT NULL,
        PRIMARY KEY(team, owner)
      );
    `);
    this.db.prepare("UPDATE jobs SET state='interrupted' WHERE state='pending'").run();
  }
  claim(delivery, team, owner, kind) {
    const id = randomUUID();
    const inserted = this.db.prepare("INSERT OR IGNORE INTO jobs VALUES(?,?,?,?,?,'pending',NULL,?)").run(id, delivery, team, owner, kind, Date.now());
    return inserted.changes ? id : null;
  }
  save(id, payload, state = 'complete') {
    this.db.prepare('UPDATE jobs SET payload=?,state=? WHERE id=?').run(JSON.stringify(payload), state, id);
  }
  get(id, team) {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id=? AND team=?').get(id, team);
    return row ? { ...row, payload: row.payload ? JSON.parse(row.payload) : null } : null;
  }
  keep(team, owner, seed) {
    this.db.prepare('INSERT OR IGNORE INTO aliens VALUES(?,?,?,?)').run(team, owner, seed, Date.now());
    this.db.prepare('INSERT INTO active VALUES(?,?,?) ON CONFLICT(team,owner) DO UPDATE SET seed=excluded.seed').run(team, owner, seed);
  }
  active(team, owner) { return this.db.prepare('SELECT seed FROM active WHERE team=? AND owner=?').get(team, owner)?.seed; }
  owns(team, owner, seed) { return Boolean(this.db.prepare('SELECT 1 FROM aliens WHERE team=? AND owner=? AND seed=?').get(team, owner, seed)); }
  collection(team, owner, page = 1) {
    const rows = this.db.prepare('SELECT seed FROM aliens WHERE team=? AND owner=? ORDER BY created DESC,seed LIMIT 10 OFFSET ?').all(team, owner, (page - 1) * 10);
    const { count } = this.db.prepare('SELECT COUNT(*) AS count FROM aliens WHERE team=? AND owner=?').get(team, owner);
    return { rows, count, active: this.active(team, owner) };
  }
  close() { this.db.close(); }
}

