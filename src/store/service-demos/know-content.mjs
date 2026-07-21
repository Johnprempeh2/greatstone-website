// Content for the Meetings & Knowledge archetype.
//
// The spine: something that was going to evaporate (a conversation, a reason, tribal knowledge) becomes
// something you can retrieve. Three kinds carry the six services:
//
//   extract    a source goes in, structure comes out, and every line of the output points back at what it
//              came from. Same mechanic forwards (transcript to recap) and backwards (history to pre-brief).
//   ask        a question gets an answer. The knowledge base is permission-aware, so the interesting demo
//              is not the answer, it is asking the SAME question as a different person. The decision log
//              answers in a different shape: the options weighed, not just the option taken.
//   workspace  one edit, and every view that depends on it moves. That is what relations and rollups mean.
//
// HONESTY RULE: no network, no model, no real documents. The transcripts, policies and decisions are
// invented. What is real is the wiring: provenance links genuinely resolve, permissions genuinely change
// the answer, and the rollups genuinely recompute from the numbers on screen.

export const KNOW = {
  // ── extract ────────────────────────────────────────────────────────────────────────────────────────
  'ai-meeting-notes-recaps': {
    kind: 'extract',
    extract: {
      sourceLabel: 'Transcript', sourceMeta: 'Client review, 34 minutes, 4 people',
      action: 'Extract the recap', outLabel: 'Recap',
      hint: 'Select anything in the recap and the words it came from light up in the transcript.',
      lines: [
        { id: 'l1', who: 'Amara (client)', t: 'Before anything else, we cannot move the go-live. The board has already been told November.' },
        { id: 'l2', who: 'John', t: 'Understood. Then the migration has to start in September, not October.' },
        { id: 'l3', who: 'Danny', t: 'September is doable if we drop the reporting module from phase one.' },
        { id: 'l4', who: 'Amara (client)', t: 'We can live without reporting until January. Nobody runs a report in December anyway.' },
        { id: 'l5', who: 'John', t: 'Then that is the call: reporting moves to phase two, migration starts 1 September.' },
        { id: 'l6', who: 'Priya', t: 'I will need the supplier list from your side to load the data. Two weeks before we start.' },
        { id: 'l7', who: 'Amara (client)', t: 'I will get that over. Give me until the 15th.' },
        { id: 'l8', who: 'Danny', t: 'One risk: if the supplier list is late, September slips and so does November.' },
      ],
      out: [
        { id: 'o1', type: 'Decision', t: 'Reporting module moves to phase two, delivering January.', from: ['l3', 'l4', 'l5'] },
        { id: 'o2', type: 'Decision', t: 'Migration starts 1 September to protect the November go-live.', from: ['l1', 'l2', 'l5'] },
        { id: 'o3', type: 'Action', t: 'Send the supplier list', owner: 'Amara', due: 'by the 15th', from: ['l6', 'l7'] },
        { id: 'o4', type: 'Risk', t: 'A late supplier list pushes September, which pushes the go-live the board has been promised.', from: ['l8', 'l1'] },
      ],
      after: 'The action lands in the task tool with its owner and its date. The recap goes out branded, and the whole thing is searchable the moment the call ends.',
    },
  },

  'automated-meeting-pre-briefs': {
    kind: 'extract',
    extract: {
      sourceLabel: 'What it read', sourceMeta: 'Meridian quarterly, tomorrow 10:00',
      action: 'Assemble the brief', outLabel: 'Your one-page brief',
      hint: 'Select any line of the brief to see which source it came from.',
      lines: [
        { id: 'l1', who: 'Recap, 14 May', t: 'Agreed to review the fee cap at the quarterly once volumes were known.' },
        { id: 'l2', who: 'CRM', t: 'Meridian Group. Owner: John. Renewal: October. Value: £84k.' },
        { id: 'l3', who: 'Email thread, 2 July', t: 'Amara: "volumes are running about 30% ahead of what we modelled."' },
        { id: 'l4', who: 'Invoice ledger', t: 'Invoice 2026-0184 outstanding, 52 days, £37k.' },
        { id: 'l5', who: 'Calendar', t: 'Attending: Amara Boateng (CFO), Tobias Reid (new, ops director).' },
        { id: 'l6', who: 'Recap, 14 May', t: 'Left open: whether phase two is in scope for this contract or the next.' },
      ],
      out: [
        { id: 'o1', type: 'Who is in the room', t: 'Amara Boateng, CFO, you have met four times. Tobias Reid is new, this is his first with you.', from: ['l5'] },
        { id: 'o2', type: 'Where you left it', t: 'You agreed in May to revisit the fee cap once volumes were known. Volumes are now 30% ahead.', from: ['l1', 'l3'] },
        { id: 'o3', type: 'Outstanding', t: '£37k unpaid at 52 days. Worth raising, and worth raising early rather than at the end.', from: ['l4'] },
        { id: 'o4', type: 'Still open', t: 'Whether phase two sits in this contract or the next. Nobody has decided, and October renewal makes it live.', from: ['l6', 'l2'] },
        { id: 'o5', type: 'Suggested order', t: 'Volumes, then the fee cap, then phase two scope, then the invoice. Money last, once the good news has landed.', from: ['l1', 'l3', 'l4', 'l6'] },
      ],
      after: 'It fires an hour before the meeting for anything flagged in your calendar. Nobody prepares it, and nobody walks in cold.',
    },
  },

  // ── ask ────────────────────────────────────────────────────────────────────────────────────────────
  'company-knowledge-ai-search': {
    kind: 'ask',
    ask: {
      askers: [
        { id: 'any', label: 'Any employee' },
        { id: 'fin', label: 'Finance' },
        { id: 'ptr', label: 'Partner' },
      ],
      askerNote: 'Same question, different person asking. The answer follows what they are cleared to see.',
      questions: [
        {
          q: 'What is our parental leave policy?',
          a: {
            any: { t: 'Six months at full pay for the primary carer, six weeks for the secondary carer, from day one of employment. No qualifying period.', cites: ['People handbook, section 4.2', 'Board minute, 12 Jan 2026'] },
          },
        },
        {
          q: 'What did we agree on the Meridian fee cap?',
          a: {
            any: { denied: true, t: 'You are not on the Meridian matter, so this one is not yours to see. The matter partner is John, and the system has told you who to ask rather than pretending the answer does not exist.' },
            fin: { denied: true, t: 'Finance can see the invoice values on this account but not the matter file, so the negotiated cap is out of scope for you.' },
            ptr: { t: 'Capped at £84k for the year, reviewable if volumes exceed the modelled range by more than 25%. They are currently 30% ahead, so the review clause is live.', cites: ['Meridian engagement letter, clause 9', 'Recap, 14 May 2026'] },
          },
        },
        {
          q: 'What is our current runway?',
          a: {
            any: { denied: true, t: 'Runway sits behind the finance permission. Nothing about it is in your index, so nothing about it can leak into an answer you receive.' },
            fin: { t: 'Fourteen months at the current burn. That drops to eleven if the two overdue accounts are not collected this quarter.', cites: ['Management accounts, June', 'Cash flow model, v9'] },
            ptr: { t: 'Fourteen months at the current burn, per the June management accounts.', cites: ['Management accounts, June'] },
          },
        },
        {
          q: 'What is our policy on subcontracting overseas?',
          a: {
            any: { gap: true, t: 'Nothing in the index answers this. Rather than assemble something plausible from adjacent documents, it has been logged as a gap.' },
            fin: { gap: true, t: 'Nothing in the index answers this. Logged as a gap for the people who would have to write it.' },
            ptr: { gap: true, t: 'Nothing in the index answers this, and you are cleared for everything, so the gap is real rather than a permission boundary.' },
          },
        },
      ],
      capture: { label: 'What we could not answer', note: 'The gaps report. Every unanswered question is logged rather than guessed at, which is how you find out what your own documentation is missing.' },
      foot: 'Your documents stay yours. Nothing here trains a public model, and the index respects the same permissions your drives already have.',
    },
  },

  'new-hire-onboarding-ai': {
    kind: 'ask',
    ask: {
      askerNote: 'Ask it the things you would feel awkward asking a colleague for the third time.',
      capture: { label: 'Gaps captured', note: 'The questions nobody has written down yet. This list is the backlog for your documentation, and it writes itself.' },
      questions: [
        {
          q: 'How do I raise an invoice?',
          a: { any: { t: 'In the ops app, open the job, then Raise invoice. It pulls the rate card automatically, so you do not price it by hand. Anything above £10k needs a partner to approve before it sends.', cites: ['Finance process, step 3', 'Ops app guide'] } },
        },
        {
          q: 'Who owns the Meridian account?',
          a: { any: { t: 'John owns it, with Priya as the delivery lead. Amara Boateng is their CFO and the person you would actually email.', cites: ['CRM, account record', 'Recap, 14 May 2026'] } },
        },
        {
          q: 'How do I book leave in my second year?',
          a: { any: { gap: true, t: 'Nobody has written this down. The handbook covers your first year and then stops, so rather than guess, this has been logged as a gap and sent to the people team.' } },
        },
        {
          q: 'What do I do if a client asks for a discount?',
          a: { any: { gap: true, t: 'There is no documented answer. Three people have now asked this, which is exactly the signal that it needs a policy rather than three different verbal ones.' } },
        },
      ],
      foot: 'Every question it cannot answer becomes a documentation task. Ask it enough and the gaps close themselves.',
    },
  },

  'searchable-decision-log': {
    kind: 'ask',
    ask: {
      shape: 'decision',
      askerNote: 'Ask why, not what. The log keeps the reasoning, including the options that lost.',
      questions: [
        {
          q: 'Why did we choose Supabase?',
          a: {
            any: {
              t: 'Because we needed row-level security and auth in the same place as the data, and we were not willing to run our own Postgres.',
              decision: {
                date: '14 March 2026', owner: 'John', status: 'Settled',
                weighed: [
                  { o: 'Supabase', v: 'Chosen. Postgres with RLS, auth and storage in one place, and we can leave with a pg_dump.' },
                  { o: 'Firebase', v: 'Rejected. Document model fought the relational shape of the catalogue, and the exit story was poor.' },
                  { o: 'Self-hosted Postgres', v: 'Rejected. No appetite to own patching and backups with the team at this size.' },
                ],
              },
              cites: ['Architecture review, 14 March', 'Cost comparison sheet'],
            },
          },
        },
        {
          q: 'Why is reporting in phase two?',
          a: {
            any: {
              t: 'Because the November go-live could not move, and dropping reporting was the only change that bought back the four weeks.',
              decision: {
                date: '21 July 2026', owner: 'John', status: 'Settled',
                weighed: [
                  { o: 'Move reporting to phase two', v: 'Chosen. The client confirmed nobody runs reports in December.' },
                  { o: 'Move the go-live', v: 'Rejected. The board had already been told November.' },
                  { o: 'Add people to phase one', v: 'Rejected. Onboarding cost would have eaten the time it bought.' },
                ],
              },
              cites: ['Client review, 21 July', 'Recap: decisions o1 and o2'],
            },
          },
        },
        {
          q: 'Why did we drop the Lagos office plan?',
          a: {
            any: {
              t: 'We did not drop it. We paused it, and the condition for restarting it was written down at the time.',
              decision: {
                date: '2 November 2025', owner: 'Ben', status: 'Reversed once, now paused',
                weighed: [
                  { o: 'Pause until two anchor clients', v: 'Chosen. Restart when two Lagos clients are signed, not before.' },
                  { o: 'Open anyway', v: 'Rejected. Would have been funded from the runway rather than from revenue.' },
                  { o: 'Cancel outright', v: 'Rejected. The demand was real, the timing was not.' },
                ],
              },
              cites: ['Board pack, November 2025', 'Reversal note, February 2026'],
            },
          },
        },
      ],
      foot: 'Every entry links back to the meeting it came from, so the reasoning survives the people who were in the room.',
    },
  },

  // ── workspace ──────────────────────────────────────────────────────────────────────────────────────
  'notion-m365-workspace-build': {
    kind: 'workspace',
    workspace: {
      hint: 'Change the client name, or any matter value. Every view that depends on it moves at the same time, because they are one record and not three copies.',
      client: { name: 'Meridian Group', owner: 'John', renewal: 'October' },
      matters: [
        { id: 'm1', name: 'Migration, phase one', value: 48000, status: 'In flight' },
        { id: 'm2', name: 'Reporting module', value: 22000, status: 'Phase two' },
        { id: 'm3', name: 'Annual support', value: 14000, status: 'In flight' },
      ],
      statuses: ['In flight', 'Phase two', 'At risk'],
      note: 'This is what a relation is for. The spreadsheet version of this needs the client name typed into three tabs, and one of them is always wrong.',
    },
  },
};

// Any service in this category without a hand-built panel gets the ask kind, built from its own copy: every
// service here ends in somebody asking a question and expecting a sourced answer.
export function knowFor(svc) {
  if (!svc) return null;
  const hand = KNOW[svc.slug];
  if (hand) return hand;
  const bullets = (Array.isArray(svc.bullets) ? svc.bullets.map((b) => b && b.text).filter(Boolean) : []).slice(0, 3);
  if (bullets.length < 2) return null;
  return {
    kind: 'ask',
    ask: {
      askerNote: 'Ask it what your team asks each other.',
      questions: bullets.map((t, i) => ({
        q: ['What does this give us?', 'How does it work?', 'What changes?'][i] || 'Tell me more',
        a: { any: { t, cites: ['Your own documents'] } },
      })),
      foot: 'Answers come from your material, with the source attached.',
    },
  };
}

export default KNOW;
