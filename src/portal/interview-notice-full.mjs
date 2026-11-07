// GRE-4303: the full interview privacy notice, the page the short notice links to (FULL_NOTICE_HREF,
// '#privacy/interviews'; '/privacy/interviews' on the Next site). Text: the "Full version" section of the
// `privacy-notice` document on GRE-2639, revision 5 (v2.1, 7 Nov 2026), word for word. A copy of that section is
// kept beside this file (interview-notice-full.rev5.md) and the test holds the two together, so the wording can
// only change by a new revision of the document. Words in [brackets] are filled per round, as the short notice
// does. Pure data, so the page and its tests read the same words.
import { formatDeletionDate } from './interview-notice.mjs';

export const FULL_NOTICE_REVISION = 5;
export const FULL_NOTICE_TITLE = 'Interview privacy notice';

// The section as the document has it. Do not edit here: change the document, then copy the new section in.
export const FULL_NOTICE_MARKDOWN = `### Who is responsible

[Client name] is the **controller** of your interview data: it decided to run this review. Greatstone International Limited (company 06248967, Parley Brook Farm, Littlewick Road, Woking, Surrey, GU21 4XR) is the **processor**: we run the interviews and analysis for [Client name], following its written instructions and a data processing agreement. Questions about this notice: dx@greatstonesoftware.co.uk. [Client data protection contact, if the client gives one.]

### What we collect

- From your website account: name, work email.
- From the invite: your role and team.
- During the interview: your answers as text. If you choose voice, your speech is sent to a speech service to turn it into text in real time; that service does not store the audio after it replies, and we do not record it.
- From your answers: the tasks, time estimates and problems you describe, and any short quotes.
- Your choices: that you agreed to take part, whether quotes may be used, and whether they carry your name.
- Technical data: sign-in times, and your IP address in server logs, which our hosting provider keeps for a short time and then deletes.

Please do not share details about your health, beliefs, union membership or other sensitive matters. If you do, we leave them out of the findings and delete them with the rest.

### Why, and on what basis

To prepare findings for [Client name] about how work gets done and where time is lost. [Client name] relies on its legitimate interest in improving how the organisation works; taking part is your choice, and saying no has no effect on you. No decisions about you are made from your answers, and nothing is decided about you automatically.

### Who sees it

- **[Client name]:** themes across the whole team, after Greatstone staff check them. Never transcripts, never your individual answers. Quotes only if you agreed, named only if you chose that. [Client name] is not told who took part, who declined or who deleted their data.
- **Greatstone:** a small team at Greatstone working on this review. Nobody else at Greatstone can open your answers.
- **Service providers** who process data for us under contract:
  - Anthropic (AI that runs the interview and analysis), United States;
  - Deepgram (speech-to-text and voice, only if you choose voice; it does not keep your audio), United States;
  - Netlify (website hosting and database), United States.

  None of them may use your data to train their models.

### Where your data is processed

Our providers process your data in the **United States**. When data leaves the UK, we use the safeguards UK law allows: the UK Extension to the EU-US Data Privacy Framework where the provider is certified (Netlify), or the international data transfer terms approved by the ICO in the provider's contract (Anthropic, Deepgram). Email dx@greatstonesoftware.co.uk for a copy.

### How long we keep it

We delete your answers, transcripts and quotes [90] days after we present the findings to [Client name] (planned for [readout date], so by [deletion date]). After that we keep only anonymous themes that cannot identify you. We also keep a record of the consent choices you made (no interview content) for 6 years, to show we treated your data lawfully.

### Your rights

From your account, at any time:

- **See my interview data**: everything we hold about you from this interview.
- **Delete my interview data**: we delete your answers, transcripts and insights, and take you out of the findings. If findings were already shared, we remove your quotes from the findings we hold.

You can also ask us to correct your data or limit how we use it, or object to its use, by emailing dx@greatstonesoftware.co.uk. We reply within one month. If you are unhappy, you can complain to the Information Commissioner's Office (ico.org.uk, 0303 123 1113).
`;

// The document gates this line: it "go[es] live only when C9 [is] confirmed" (claim C9: the client is not told who
// took part or declined; Flint to confirm after the port). The short notice leaves it out for the same reason.
// When C9 is confirmed, set this to true.
export const C9_CONFIRMED = false;
const C9_LINE = ' [Client name] is not told who took part, who declined or who deleted their data.';

/** One round's values for the [bracketed] words. A sentence with no value yet names the rule, not a date. */
function fill(markdown, { clientName, retentionDays = 90, readoutDate = null, deletionDate = null }) {
  const named = String(clientName || '').trim();
  const days = Number.isInteger(retentionDays) && retentionDays >= 0 ? retentionDays : 90;
  const readout = formatDeletionDate(readoutDate);
  const by = formatDeletionDate(deletionDate);
  const when = readout && by ? ` (planned for ${readout}, so by ${by})` : by ? ` (by ${by})` : '';
  return markdown
    .replace(' (planned for [readout date], so by [deletion date])', when)
    // No field holds a client data protection contact yet, so the sentence is left out.
    .replace(' [Client data protection contact, if the client gives one.]', '')
    .replaceAll('[90]', String(days))
    // Without a round (signed out, or no invitation): "your organisation", capitalised where a sentence starts.
    .replace(/\[Client name\]/g, (_, at, all) =>
      named || (/(^|\n|\. |\*\*)$/.test(all.slice(0, at)) ? 'Your organisation' : 'your organisation'));
}

/**
 * The notice for one round, as blocks: { type: 'h2', text } | { type: 'p', text } | { type: 'ul', items }, where an
 * item is { text, items?, after? } (a nested list and a paragraph under it). Text keeps **bold** marks; see
 * `inlineParts`.
 */
export function fullInterviewNotice(round = {}) {
  let markdown = FULL_NOTICE_MARKDOWN;
  if (!C9_CONFIRMED) markdown = markdown.replace(C9_LINE, '');
  const blocks = [];
  let list = null;
  let item = null;
  for (const line of fill(markdown, round).split('\n')) {
    if (!line.trim()) continue;
    const heading = /^### (.+)$/.exec(line);
    const top = /^- (.+)$/.exec(line);
    const nested = /^ {2}- (.+)$/.exec(line);
    const under = /^ {2}(\S.*)$/.exec(line);
    if (heading) { blocks.push({ type: 'h2', text: heading[1] }); list = item = null; }
    else if (top) {
      if (!list) blocks.push(list = { type: 'ul', items: [] });
      list.items.push(item = { text: top[1] });
    } else if (nested && item) (item.items ||= []).push({ text: nested[1] });
    else if (under && item) item.after = under[1];
    else { blocks.push({ type: 'p', text: line }); list = item = null; }
  }
  return { title: FULL_NOTICE_TITLE, blocks };
}

/** '**a** b' → [{ strong: true, text: 'a' }, { strong: false, text: ' b' }] */
export function inlineParts(text) {
  return String(text).split(/(\*\*[^*]+\*\*)/).filter(Boolean)
    .map((part) => (part.startsWith('**') ? { strong: true, text: part.slice(2, -2) } : { strong: false, text: part }));
}
