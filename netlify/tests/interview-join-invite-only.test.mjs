// GRE-4418: a round opened with self-enrol off. Every invitation email carries the round's #join/<token> link, so the
// link must work for the people GSAM invited and for nobody else: enrol_enabled gates self-enrolment only.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, account, joinEnrol, makeHandlers, makeVerify, newCustomer, post, seedRound, skip, startInterviewDb } from './lib/interview-harness.mjs';

let db;
before(async () => { if (!skip) db = await startInterviewDb('interview-join-invite-only'); });
after(async () => { await db?.stop(); });

describe('join link with self-enrol off', { skip }, () => {
  let h, round, ivy, sam;
  const info = async (token) => (await (await h.join(post('/api/interview/join', { body: { op: 'info', token } }))).json()).data;

  before(() => {
    round = seedRound(db.sql, { customerId: newCustomer(db.sql, 'Invite only'), clientName: 'Secret Client Ltd' });
    ivy = account('ivy');
    sam = account('sam'); // same allowed domain, never invited
    db.sql(`UPDATE interview.engagement SET enrol_enabled = false WHERE id = '${round.id}';
      INSERT INTO interview.employee (engagement_id, unit_id, name, email, portal_role)
        VALUES ('${round.id}', '${round.teamUnit}', 'Ivy', '${ivy.email.toUpperCase()}', 'employee');`);
    h = makeHandlers({ pool: db.pool, env: MODES[0].env, verify: makeVerify([ivy, sam]) });
  });

  test('signed-out info: the link is valid, but names no client, domain or team', async () => {
    const data = await info(round.token);
    assert.equal(data.valid, true);
    assert.equal(data.selfEnrol, false);
    assert.equal(data.clientName, null);
    assert.deepEqual([data.domains, data.teams, data.team], [[], [], null]);
    assert.ok(!JSON.stringify(data).includes('Secret Client'));
  });

  test('an uninvited account on an allowed domain is refused and gets no row', async () => {
    const out = await joinEnrol(h, sam, round.token);
    assert.equal(out.status, 400);
    assert.match(out.body.data.message, /invited to this round/);
    assert.equal(db.sql(`SELECT count(*) FROM interview.employee WHERE engagement_id = '${round.id}' AND email = '${sam.email}'`), '0');
  });

  test('the invited account claims its invitation and goes to the conversation; a re-click is fine', async () => {
    const out = await joinEnrol(h, ivy, round.token);
    assert.deepEqual([out.status, out.body.data.ok, out.body.data.redirect], [200, true, '#portal/interview']);
    assert.equal(db.sql(`SELECT user_id FROM interview.employee WHERE engagement_id = '${round.id}' AND lower(email) = lower('${ivy.email}')`), ivy.id);
    assert.equal((await joinEnrol(h, ivy, round.token)).body.data.ok, true);
  });

  test('a closed round is still not active', async () => {
    db.sql(`UPDATE interview.engagement SET status = 'closed' WHERE id = '${round.id}'`);
    assert.equal((await info(round.token)).valid, false);
    assert.match((await joinEnrol(h, ivy, round.token)).body.data.message, /not active/);
  });
});
