// Front door local stub (GRE-462): a stand-in for the Messages API so the whole front-door path (Turnstile,
// session, six-message cap, rate limit, validateProposal, the FrontDoor block) runs on a laptop with no key
// and no cost. It answers in the API's own shape, so runChat/runProposal and every check run unchanged.
// It is not a model: replies are fixed, safe lines. The B6 live eval still needs a real key.
// The edge function only uses it when FRONT_DOOR_STUB=1, no ANTHROPIC_API_KEY is set and SUPABASE_URL is not
// a hosted project (stubAllowed below), so it can never answer a real visitor.
import { CHAT_TURNS, CLOSE_OK } from './front-door-prompts.mjs';

export const STUB_KEY = 'local-stub';

// Never in a hosted project, never beside a real key, only when asked for by name.
export function stubAllowed({ flag, apiKey, supabaseUrl }) {
  if (flag !== '1' || apiKey) return false;
  return !/\.supabase\.(co|in)\b/i.test(String(supabaseUrl || ''));
}

const QUESTIONS = [
  'Which task takes the most of your week right now?',
  'Who does that work today, and where does it slow down?',
  'What would a good first month look like for a new hire?',
  'Which tools does your team use every day?',
  'Is there one thing you would never hand to someone new?',
];

const TEAM = [
  { name: 'Amara', role: 'Team lead who keeps the work moving', personality: ['calm', 'clear', 'steady'],
    first_tasks: ['Map the jobs that fill each week', 'Write a one-page plan for month one', 'Check work before it goes out'],
    works_with: 'Checks what Kenji and Sofia send before it reaches a customer.' },
  { name: 'Kenji', role: 'Coordinator who keeps diaries and follow-ups on track', personality: ['quick', 'tidy', 'reliable'],
    first_tasks: ['Book this week\'s calls', 'Send a follow-up after each call', 'Keep one shared task list'],
    works_with: 'Hands call notes to Amara for a check.' },
  { name: 'Sofia', role: 'Admin who keeps records and paperwork up to date', personality: ['organised', 'patient', 'exact'],
    first_tasks: ['Tidy the customer records', 'Chase missing paperwork', 'Draft the monthly update'],
    works_with: 'Takes dates from Kenji and sends updates to Amara.' },
];

const textMsg = (text) => ({ type: 'message', role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'end_turn' });

export function stubResponse(body) {
  if (Array.isArray(body.tools) && body.tools.length) {
    const input = {
      status: 'ok', decline_reason: 'none',
      agents: TEAM.map((a, i) => ({ ...a, is_lead: i === 0 })),
      chat_summary: [],
    };
    return { type: 'message', role: 'assistant', content: [{ type: 'tool_use', id: 'stub', name: body.tools[0].name, input }], stop_reason: 'tool_use' };
  }
  const turns = (body.messages || []).filter((m) => m.role === 'user').length;
  if (turns >= CHAT_TURNS) return textMsg(CLOSE_OK);
  return textMsg(QUESTIONS[(turns - 1) % QUESTIONS.length]);
}

// A fetch with the Messages API's contract: the same call runChat/runProposal make, answered locally.
export async function stubFetch(_url, init) {
  const body = JSON.parse(init.body);
  return new Response(JSON.stringify(stubResponse(body)), { status: 200, headers: { 'content-type': 'application/json' } });
}
