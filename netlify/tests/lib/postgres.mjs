// A throwaway real Postgres for the RLS suites (GRE-1795). PGlite (@netlify/database-dev) has one session for every
// connection and no role attributes, so it cannot prove what these suites prove: who can read what, and that
// claims end with each transaction on a pooled connection.
//
// The database matches Netlify Database's: the migrations run as `netlifydb_owner`, a role that is not a superuser
// but has BYPASSRLS, CREATEROLE and CREATEDB (checked on the staging database), and they are applied with
// @netlify/database-dev's own runner, so the order and the netlify.migrations log are Netlify's.
//
// Needs the Postgres server binaries (initdb, pg_ctl, psql): PG_BIN, pg_config, or the newest
// /usr/lib/postgresql/<n>/bin. Without them a suite is skipped and says so, except on CI, where it fails.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { applyMigrations } from '@netlify/database-dev';
import pg from 'pg';

export const MIGRATIONS = fileURLToPath(new URL('../../database/migrations', import.meta.url));
export const OWNER = 'netlifydb_owner';

function findPgBin() {
  const ok = (d) => d && existsSync(join(d, 'initdb')) && existsSync(join(d, 'pg_ctl')) && existsSync(join(d, 'psql'));
  if (ok(process.env.PG_BIN)) return process.env.PG_BIN;
  const base = '/usr/lib/postgresql';
  if (existsSync(base)) {
    for (const v of readdirSync(base).sort((a, b) => Number(b) - Number(a))) if (ok(join(base, v, 'bin'))) return join(base, v, 'bin');
  }
  const cfg = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
  if (cfg.status === 0 && ok(cfg.stdout.trim())) return cfg.stdout.trim();
  return null;
}

export const BIN = findPgBin();
if (!BIN && process.env.CI) throw new Error('Postgres server binaries not found on CI (set PG_BIN): the RLS suites must run, not skip');
export const skip = BIN ? false : 'Postgres server binaries not found (set PG_BIN)';

/**
 * Start an empty cluster with one database owned by netlifydb_owner. Returns
 *   psql(sql, user?)     run sql through psql (synchronous), as the owner unless another login role is given
 *   migrate(target?)     apply netlify/database/migrations up to and including `target` (a name or its number)
 *   url                  a connection string for pg, as the owner
 *   connArgs(), psqlBin  to start a second psql session
 *   stop()               stop the cluster and remove its files
 */
export function startPostgres(label) {
  // a unix socket path must stay short, so prefer a short temp root
  const root = tmpdir().length < 60 ? tmpdir() : '/tmp';
  const dir = mkdtempSync(join(root, `${label}-`));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const run = (cmd, args) => {
    const r = spawnSync(join(BIN, cmd), args, { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`${cmd}: ${r.stderr || r.stdout}`);
  };
  run('initdb', ['-D', join(dir, 'data'), '-U', 'postgres', '-A', 'trust']);
  run('pg_ctl', ['-D', join(dir, 'data'), '-w', '-l', join(dir, 'log'), '-o', `-p ${port} -k ${dir} -c listen_addresses=''`, 'start']);

  const psql = (sql, user = OWNER, db = 'netlifydb') =>
    spawnSync(join(BIN, 'psql'), ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-h', dir, '-p', String(port), '-U', user, '-d', db, '-f', '-'], {
      input: sql,
      encoding: 'utf8',
      env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' },
    });
  const setup = psql(
    `CREATE ROLE ${OWNER} LOGIN CREATEROLE CREATEDB BYPASSRLS;
     CREATE DATABASE netlifydb OWNER ${OWNER};`,
    'postgres',
    'postgres',
  );
  if (setup.status !== 0) throw new Error(setup.stderr);

  const url = `postgres://${OWNER}@localhost/netlifydb?host=${encodeURIComponent(dir)}&port=${port}`;
  async function migrate(target) {
    const client = new pg.Client({ host: dir, port, user: OWNER, database: 'netlifydb' });
    await client.connect();
    // the PGlite surface that @netlify/database-dev's runner uses, on a real connection
    const db = {
      exec: (sql) => client.query(sql),
      query: (sql, params) => client.query(sql, params),
      async transaction(fn) {
        await client.query('BEGIN');
        try {
          const out = await fn(db);
          await client.query('COMMIT');
          return out;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        }
      },
    };
    try {
      return await applyMigrations(db, MIGRATIONS, target);
    } finally {
      await client.end();
    }
  }
  function stop() {
    spawnSync(join(BIN, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', 'stop'], { encoding: 'utf8' });
    rmSync(dir, { recursive: true, force: true });
  }
  // psql's connection arguments, for a test that needs a second session of its own
  const connArgs = (user = OWNER) => ['-X', '-q', '-h', dir, '-p', String(port), '-U', user, '-d', 'netlifydb'];
  return { psql, migrate, url, connArgs, psqlBin: join(BIN, 'psql'), stop };
}
