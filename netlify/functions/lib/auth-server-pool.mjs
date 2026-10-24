// One checked-out pg client for one Better Auth HTTP request. Kysely's inner
// transactions are savepoints, so they cannot end the outer SET LOCAL ROLE.
const BEGIN = /^\s*(?:BEGIN|START\s+TRANSACTION)(?:\s+(?:TRANSACTION|WORK))?\s*;?\s*$/i;
const COMMIT = /^\s*(?:COMMIT|END)(?:\s+(?:TRANSACTION|WORK))?\s*;?\s*$/i;
const ROLLBACK = /^\s*ROLLBACK(?:\s+(?:TRANSACTION|WORK))?\s*;?\s*$/i;
const ROLE_CHANGE = /(?:^|;)\s*(?:SET\s+(?:(?:LOCAL|SESSION)\s+)?ROLE|RESET\s+ROLE|SET\s+(?:SESSION\s+)?AUTHORIZATION|RESET\s+ALL)\b/i;

export function authServerPool(pool) {
  let clientPromise;
  let client;
  let proxy;
  let finished = false;
  let failed = false;
  const savepoints = [];

  async function connect() {
    if (finished) throw new Error('Auth request has ended');
    if (!clientPromise) clientPromise = (async () => {
      const checkedOut = await pool.connect();
      try {
        await checkedOut.query('BEGIN');
        await checkedOut.query('SET LOCAL ROLE auth_server');
        await checkedOut.query('SET LOCAL search_path TO better_auth');
        await checkedOut.query("SELECT set_config('request.jwt.claims', $1, true)", ['{"role":"auth_server"}']);
        client = checkedOut;
        proxy = {
          async query(sql, params) {
            const statement = typeof sql === 'string' ? sql : sql?.text;
            if (typeof statement !== 'string') throw new Error('Expected a SQL statement');
            if (/;\s*\S/.test(statement)) throw new Error('Auth query must contain one statement');
            if (ROLE_CHANGE.test(statement)) throw new Error('Auth query cannot change database role');
            if (BEGIN.test(statement)) {
              const name = `auth_inner_${savepoints.length + 1}`;
              const result = await client.query(`SAVEPOINT ${name}`);
              savepoints.push(name);
              return result;
            }
            if (COMMIT.test(statement) || ROLLBACK.test(statement)) {
              const name = savepoints.pop();
              if (!name) throw new Error('Auth query cannot end the outer transaction');
              if (ROLLBACK.test(statement)) {
                const result = await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
                await client.query(`RELEASE SAVEPOINT ${name}`);
                failed = false;
                return result;
              }
              return client.query(`RELEASE SAVEPOINT ${name}`);
            }
            try { return await client.query(sql, params); }
            catch (error) { failed = true; throw error; }
          },
          // Kysely releases between operations. The request, not Kysely, owns
          // the outer transaction and checks the real client back in.
          release() {},
        };
        return proxy;
      } catch (error) {
        try { await checkedOut.query('ROLLBACK'); } finally { checkedOut.release(); }
        throw error;
      }
    })();
    return clientPromise;
  }

  return {
    connect,
    async end() {},
    async finish(success = true) {
      if (finished) return;
      finished = true;
      if (!clientPromise) return;
      try {
        await clientPromise;
        await client.query(success && !failed && !savepoints.length ? 'COMMIT' : 'ROLLBACK');
      } finally {
        client?.release();
      }
    },
  };
}
