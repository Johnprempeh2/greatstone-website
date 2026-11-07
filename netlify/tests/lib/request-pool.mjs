// A pool for a visitor's or customer's request (GRE-3772). The real pool logs in as netlifydb_owner, which has
// BYPASSRLS, so a query on it skips every policy. A request handler may only run SQL inside a transaction that has
// first done SET LOCAL ROLE to one of `roles`. Anything else throws, so a test fails the moment a handler reaches the
// owner's privileges: pool.query(...), a statement before SET LOCAL ROLE, or a role it should not use (service_role).
const ROLE = /^SET LOCAL ROLE ([a-z_]+)$/;

export function requestPool(pool, roles) {
  const used = [];
  const refuse = (why) => { throw new Error(`request pool: ${why}`); };
  return {
    used,
    query: () => refuse('a query on the owner pool (outside any role)'),
    async connect() {
      const client = await pool.connect();
      let role = null;
      return {
        async query(sql, params) {
          const text = String(sql?.text ?? sql).trim();
          if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
            role = null;
            return client.query(sql, params);
          }
          const set = ROLE.exec(text);
          if (set) {
            if (!roles.includes(set[1])) refuse(`SET LOCAL ROLE ${set[1]} is not allowed here`);
            role = set[1];
            used.push(role);
            return client.query(sql, params);
          }
          if (!role) refuse(`a statement before SET LOCAL ROLE: ${text.slice(0, 60)}`);
          return client.query(sql, params);
        },
        release: (error) => client.release(error),
      };
    },
  };
}
