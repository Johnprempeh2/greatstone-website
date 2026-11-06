import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE_LABELS, PHASE_ORDER, phaseDots, VOICE_HINT, lastAgentTurnId, needsKickoff, newClientTurnId,
  selectionSummary, domainHint, teamUnitFor, hoursLabel, bandFor, BOARD_GROUPS, holdingProgress, visibleSynthesis,
} from './model.mjs';
import { isVerified, isUnverifiedError, isExistingAccountError, signInErrorMessage, signUpErrorMessage, verifyCallbackURL } from './auth-model.mjs';

test('phase dots: five phases, done / current / future, as the source', () => {
  assert.deepEqual(PHASE_ORDER, ['warmup', 'day_in_life', 'pain_mapping', 'automation', 'sign_off']);
  assert.equal(PHASE_LABELS.automation, 'Ideas');
  const p = phaseDots('pain_mapping');
  assert.equal(p.ariaLabel, 'Conversation progress, phase 3 of 5');
  assert.deepEqual(p.dots.map((d) => d.state), ['done', 'done', 'current', '', '']);
  assert.equal(p.dots[2].tip, 'Pain mapping, where we are now');
  assert.equal(p.dots[3].tip, 'Ideas');
});

test('chat: kickoff on an empty or user-last transcript, last agent turn found', () => {
  assert.equal(needsKickoff([]), true);
  assert.equal(needsKickoff([{ id: 'a', role: 'agent' }, { id: 'u', role: 'user' }]), true);
  assert.equal(needsKickoff([{ id: 'u', role: 'user' }, { id: 'a', role: 'agent' }]), false);
  assert.equal(lastAgentTurnId([{ id: 'a1', role: 'agent' }, { id: 'u', role: 'user' }, { id: 'a2', role: 'agent' }]), 'a2');
  assert.equal(lastAgentTurnId([]), undefined);
  assert.notEqual(newClientTurnId(), newClientTurnId());
  assert.equal(VOICE_HINT.speaking, 'Speaking. Just talk over me if you want to jump in.');
});

test('sign-off selection summary', () => {
  assert.equal(selectionSummary('anonymised', false), 'Anonymised quotes · no memory kept');
  assert.equal(selectionSummary('named', true), 'Named quotes · conversation remembered');
});

test('join: domain hint and team targeting', () => {
  assert.equal(domainHint([]), null);
  assert.equal(domainHint(['acme.com']), 'Use your work email (a acme.com address).');
  assert.equal(domainHint(['a.com', 'b.com']), 'Use your work email (a.com or b.com).');
  const teams = [{ id: 'u1', name: 'Ops' }];
  assert.deepEqual(teamUnitFor(teams, 'u1'), { id: 'u1', name: 'Ops' });
  assert.equal(teamUnitFor(teams, 'nope'), null);
  assert.equal(teamUnitFor(teams, null), null);
});

test('results helpers: hours, confidence band, board groups', () => {
  assert.equal(hoursLabel(3), '3 h/week');
  assert.equal(hoursLabel(2.25), '2.3 h/week');
  assert.equal(bandFor(0.75), 'well evidenced');
  assert.equal(bandFor(0.5), 'evidenced');
  assert.equal(bandFor(0.49), 'indicative');
  const pick = (r) => BOARD_GROUPS.find((g) => g.match(r)).label;
  assert.equal(pick({ impact: 4, feasibility: 4 }), 'Do first');
  assert.equal(pick({ impact: 5, feasibility: 2 }), 'Plan properly');
  assert.equal(pick({ impact: 2, feasibility: 5 }), 'Easy relief');
  assert.equal(pick({ impact: 1, feasibility: 1 }), 'Park for now');
});

test('holding screen: counts interviewees only, never cost', () => {
  const people = [
    { status: 'completed', portal_role: 'employee' },
    { status: 'started', portal_role: 'team_leader' },
    { status: 'invited', portal_role: 'employee' },
    { status: 'completed', portal_role: 'client_admin' },
  ];
  const h = holdingProgress({ people, synthesisCount: 0, readoutAt: null, endDate: '2026-11-13' });
  assert.deepEqual([h.total, h.completed, h.started, h.invited, h.pct], [3, 1, 1, 1, 33]);
  assert.equal(h.hasSynthesis, false);
  assert.match(h.statusLine, /conversations are under way/);
  assert.equal(h.targetDate, '13 November 2026');
  assert.match(holdingProgress({ people, synthesisCount: 2 }).statusLine, /drafted/);
  assert.match(holdingProgress({}).statusLine, /being set up/);
});

test('released synthesis: anything that failed re-verification is refused', () => {
  const synthesis = {
    generated_at: '2026-11-10T09:00:00Z',
    themes: [{ theme_id: 't1', scope: 'cross_team' }, { theme_id: 't2', scope: 'within_team' }, { theme_id: 't3', scope: 'cross_team' }],
    hot_spots: [{ unit_id: 'u', first_hand_hours_per_week: 6, local_themes: [{ theme_id: 't2' }, { theme_id: 't3' }] }],
    recommendations: [{ rec_id: 'r1' }, { rec_id: 'r2' }],
    validation_log: [{ kind: 'open_question', reason: 'q' }, { kind: 'theme_dropped' }, { kind: 'theme_demoted' }],
    methodology: { sessions_complete: 2, sessions_partial: 0 },
  };
  const v = visibleSynthesis(synthesis, ['t3', 'r2']);
  assert.deepEqual(v.themes.map((t) => t.theme_id), ['t1', 't2']);
  assert.deepEqual(v.crossThemes.map((t) => t.theme_id), ['t1']);
  assert.deepEqual(v.hotSpots[0].local_themes.map((t) => t.theme_id), ['t2']);
  assert.deepEqual(v.recommendations.map((r) => r.rec_id), ['r1']);
  assert.equal(v.openQuestions.length, 1);
  assert.equal(v.suppressed.length, 2);
  assert.equal(v.maxHours, 6);
  assert.equal(v.interviewsIncluded, 2);
  assert.equal(v.sparse, true);
  assert.equal(v.failedCount, 2);
  assert.equal(v.generated, '10 November 2026');
  assert.equal(visibleSynthesis({ generated_at: '2026-11-10T09:00:00Z' }).maxHours, 1);
});

test('website account: verified email is required; Better Auth errors in plain words', () => {
  assert.equal(isVerified({ user: { emailVerified: true } }), true);
  assert.equal(isVerified({ user: { emailVerified: false } }), false);
  assert.equal(isVerified(null), false);
  assert.equal(isUnverifiedError({ code: 'EMAIL_NOT_VERIFIED', status: 403 }), true);
  assert.match(signInErrorMessage({ code: 'EMAIL_NOT_VERIFIED' }), /confirm your email/);
  assert.match(signInErrorMessage({ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 }), /did not work/);
  assert.match(signInErrorMessage({ status: 429 }), /Too many attempts/);
  assert.equal(signInErrorMessage(null), null);
  assert.equal(isExistingAccountError({ code: 'USER_ALREADY_EXISTS' }), true);
  assert.match(signUpErrorMessage({ code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' }), /already have an account/);
  assert.match(signUpErrorMessage({ code: 'PASSWORD_TOO_SHORT' }), /at least 8/);
  assert.equal(verifyCallbackURL('#join/abc?team=u1'), '/#join/abc?team=u1');
  assert.equal(verifyCallbackURL('#portal/interview'), '/#portal/interview');
});
