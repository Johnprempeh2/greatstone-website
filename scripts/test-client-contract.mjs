import { readFileSync } from 'node:fs';

export const fixture = JSON.parse(readFileSync(new URL('../contracts/greatstone-test-client.json', import.meta.url), 'utf8'));

export function assertTestClientContract(value) {
  if (value?.version !== 1 || value.customer?.slug !== 'greatstone-test-client' ||
      value.customer?.name !== 'Greatstone Test Client (TEST DATA)' ||
      value.customer?.domain !== 'greatstone-test.invalid' ||
      value.staff?.length !== 3 || value.teams?.length !== 2 ||
      value.teams.some((team) => team.clients?.length !== 3)) {
    throw new Error('Test client fixture shape or identity differs from the approved contract');
  }
  const users = [...value.staff, ...value.teams.flatMap((team) => team.clients)];
  const ids = [value.customer.id, ...users.map((user) => user.id)];
  const emails = users.map((user) => user.email);
  if (ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) ||
      new Set(ids).size !== ids.length || new Set(emails).size !== emails.length ||
      emails.some((email) => !/^[a-z0-9-]+@greatstone-test\.invalid$/.test(email))) {
    throw new Error('Test client fixture contains an unsafe or duplicate identity');
  }
  return value;
}

assertTestClientContract(fixture);
