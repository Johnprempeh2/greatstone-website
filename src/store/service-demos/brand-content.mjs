// Content for the Brand, Content & Media archetype.
//
// FOUR KINDS, because this category is two trades wearing one label. Half of it is craft you have to SEE
// (a mark that reacts, a generative study, an icon that catches light); half of it is production leverage
// you have to COUNT (one brief becoming four channel-shaped pieces, a document assembling itself). A demo
// that only did one would have sold only half the category.
//
//   motion    the real WebGL mark, driven by cursor or by a scroll scrubber   (2 services)
//   studio    generative studies and light-responsive relief, on canvas       (2 services)
//   multiply  one brief in, the channel-shaped pieces out                     (4 services)
//   document  modules toggle on and the branded artefact assembles            (3 services)
//
// HONESTY RULE: the motion kind runs our OWN mark, because it is the one real-time build we can truthfully
// put in front of a visitor. Each motion entry carries a `truth` line saying exactly that. The studio kind
// draws for real (seeded, reproducible), and the written pieces below are samples, labelled by the frame.

export const PIECES = {
  // ── motion: the real engine ────────────────────────────────────────────────────────────────────────
  'interactive-3d-logo': {
    kind: 'motion',
    motion: {
      mode: 'cursor',
      hint: 'Move your pointer across the mark. The slabs lean towards it and the rim picks up the light.',
      truth: 'This is the Greatstone mark itself, running as a real-time WebGL build in your browser right now. Yours would be your mark, built the same way.',
      facts: [['Real time', 'WebGL, not a video'], ['Drop-in', 'One component, one hero'], ['Falls back', 'Still frame on reduced motion']],
    },
  },

  'cinematic-3d-brand-website': {
    kind: 'motion',
    motion: {
      mode: 'scroll',
      hint: 'Drag the scrubber. The mark breaks into its parts as the page moves, and reassembles on the way back.',
      truth: 'The same real-time build, driven by scroll position instead of the pointer. On a live page the scrubber is the visitor scrolling.',
      facts: [['Scroll-driven', 'Motion paced to the story'], ['Reversible', 'It reassembles, always'], ['Shareable', 'A link, plus a PDF for procurement']],
    },
  },

  // ── studio: generative craft ───────────────────────────────────────────────────────────────────────
  'daily-brand-animation-service': {
    kind: 'studio',
    studio: {
      mode: 'studies',
      hint: 'Every study is generated here, now, from a seed. Ask for another and the technique changes with it.',
      truth: 'Drawn live in your browser from a seeded generator, so study 014 looks the same every time it is opened. The service runs this on a schedule and files each one in a gallery.',
      facts: [['Daily', 'One new study, on a schedule'], ['Never repeats', 'Technique and feel both move'], ['Export-ready', 'Loops for social, heroes, loaders']],
    },
  },

  '3d-icon-set-design': {
    kind: 'studio',
    studio: {
      mode: 'relief',
      hint: 'Drag the light. Then take the depth to zero to see what you started with.',
      truth: 'A live render of the relief behaviour: the light is real and follows your pointer. The delivered set is built as 3D geometry, with static renders supplied for decks.',
      facts: [['One material', 'The whole set feels carved alike'], ['Drop-in', 'Feature grids, pillars, badges'], ['Static too', 'Renders for decks and documents']],
    },
  },

  // ── multiply: one brief, many pieces ───────────────────────────────────────────────────────────────
  'always-on-content-production': {
    kind: 'multiply',
    multiply: {
      briefLabel: 'The brief',
      brief: 'We cut a client’s month-end close from 9 days to 3. Write it up.',
      voice: 'Trained on your past work, so the draft already sounds like you.',
      outputs: [
        { id: 'blog', label: 'Blog draft', meta: '820 words', body: 'Most finance teams do not have a close problem. They have a handover problem. Nine days became three when we stopped asking who was waiting on whom and started making the wait visible.' },
        { id: 'li', label: 'LinkedIn', meta: '3 lines', body: 'Nine days to three.\n\nNot new software. We made the handovers visible, and the waiting stopped being invisible work.\n\nThe close was never the bottleneck.' },
        { id: 'email', label: 'Newsletter', meta: 'Subject + body', body: 'Subject: The close was never the bottleneck\n\nWhen a month-end close runs long, the instinct is to buy something. This one did not need buying. It needed the handovers written down.' },
        { id: 'ads', label: 'Ad lines', meta: '4 variants', body: '1. Close in 3 days, not 9.\n2. Your close is not slow. Your handovers are.\n3. Month-end, finished by Wednesday.\n4. Make the waiting visible.' },
      ],
    },
  },

  'social-clip-repurposing': {
    kind: 'multiply',
    multiply: {
      briefLabel: 'The long asset',
      brief: 'A 48-minute webinar recording: "What finance teams get wrong about automation".',
      voice: 'One asset in. A month of channel-shaped cuts out.',
      outputs: [
        { id: 'hook', label: 'Clip 1', meta: '0:42, vertical', body: 'Hook: "The tool was never the problem."\nCut from 07:12 to 07:54. Captions burned in, brand end-card, safe margins for the platform’s UI.' },
        { id: 'clip2', label: 'Clip 2', meta: '1:05, vertical', body: 'Hook: "Nine days to three, and nobody bought anything."\nCut from 22:40 to 23:45. The number lands on screen as it is said.' },
        { id: 'carousel', label: 'Carousel', meta: '6 slides', body: 'Slide 1: The close is not the bottleneck\nSlide 2: Where the days actually go\nSlide 3: Handovers, counted\nSlide 4: What we changed\nSlide 5: 9 to 3\nSlide 6: How to start' },
        { id: 'copy', label: 'Post copy', meta: 'Per platform', body: 'LinkedIn: the full point, three short paragraphs, no hashtags.\nInstagram: one line and the hook, hashtags below the fold.\nX: the number first, the reason second.' },
      ],
    },
  },

  'impact-storytelling-content': {
    kind: 'multiply',
    multiply: {
      briefLabel: 'What came in from the field',
      brief: 'Voice note and four photos from the Tamale site: 62 girls finished the term, 3 dropped out, the water tank held.',
      voice: 'Your team’s words, tidied. Never invented.',
      outputs: [
        { id: 'news', label: 'Supporter newsletter', meta: 'Monthly, drafted', body: 'Sixty-two girls finished the term in Tamale. Three did not, and we know why, which matters more than the number. The tank you funded in March held through the dry weeks.' },
        { id: 'social', label: 'Social post', meta: '1 image + copy', body: '62 finished the term.\n\nThe tank held. That is the whole reason three of those girls did not have to choose between water and school.\n\nThank you for March.' },
        { id: 'case', label: 'Case study', meta: '1 page', body: 'Context, what was funded, what changed, what did not, and what the next term needs. Written for a funder who will read the middle section first.' },
        { id: 'approve', label: 'Approval', meta: 'Before anything ships', body: 'Nothing publishes on its own. Your team sees every draft, edits in place, and presses send. The engine drafts; a person decides.' },
      ],
    },
  },

  'ai-explainer-product-videos': {
    kind: 'multiply',
    multiply: {
      briefLabel: 'The script',
      brief: 'A 90-second explainer for the client portal: what it is, who it is for, what changes.',
      voice: 'From words to a finished cut, without a shoot.',
      outputs: [
        { id: 'scenes', label: 'Scene plan', meta: '6 scenes', body: '1. The problem, in one line\n2. The old way, on screen\n3. The portal, opening\n4. One task, done in five seconds\n5. What it replaces\n6. End card and call to action' },
        { id: 'vo', label: 'Voiceover', meta: '88 seconds', body: 'Your clients email to ask where things are. Not because they are impatient, but because there is nowhere to look. The portal gives them somewhere to look.' },
        { id: 'caps', label: 'Captions', meta: 'Burned + SRT', body: 'On-brand captions in your type, timed to the read, plus an SRT so the platform can index it.' },
        { id: 'cuts', label: 'Cuts', meta: '3 formats', body: '90 seconds for the site. 30 seconds for the deck. 15 seconds vertical for social, with the hook moved to the front.' },
      ],
    },
  },

  // ── document: the artefact assembles ───────────────────────────────────────────────────────────────
  'branded-proposal-document-builder': {
    kind: 'document',
    document: {
      title: 'Proposal: month-end close review',
      client: 'Meridian Group',
      hint: 'Switch the modules. The document rebuilds, and the estimate moves with it.',
      manualMin: 240, autoMin: 12,
      modules: [
        { id: 'scope', label: 'Scope', on: true, h: 'What we will do', b: 'Map the close end to end, count the handovers, and return a sequenced plan with the three changes worth making first.' },
        { id: 'approach', label: 'Approach', on: true, h: 'How we work', b: 'Two weeks. One week observing the actual close, one week writing. No workshop theatre.' },
        { id: 'team', label: 'Team', on: false, h: 'Who does it', b: 'A lead and an analyst. The lead is in the room for the close itself, not just the readout.' },
        { id: 'proof', label: 'Case study', on: false, h: 'Where we have done this', b: 'A 200-person distributor went from 9 days to 3 without new software. Their finance director will take your call.' },
        { id: 'fees', label: 'Fees', on: true, h: 'What it costs', b: 'Fixed fee, £14,500, payable on delivery of the plan. No day-rate creep.' },
        { id: 'sign', label: 'E-signature', on: false, h: 'Accepting', b: 'Sign in the browser. Countersigned copy filed to both sides automatically.' },
      ],
    },
  },

  'annual-impact-report-design': {
    kind: 'document',
    document: {
      title: 'Impact report 2026',
      client: 'Tamale Girls’ Education Trust',
      hint: 'Switch the sections. Select a bar to change what the chart is arguing.',
      manualMin: 1800, autoMin: 90,
      modules: [
        { id: 'letter', label: 'Chair’s letter', on: true, h: 'From the chair', b: 'A year where the numbers moved and the reasons were finally legible. What follows is the second part.' },
        { id: 'chart', label: 'The numbers', on: true, chart: true },
        { id: 'story', label: 'A story', on: true, h: 'Tamale, third term', b: 'Sixty-two girls finished. Three did not, and the report says why on page 14 rather than leaving it to the appendix.' },
        { id: 'spend', label: 'Where money went', on: false, h: 'Every pound', b: '82p to programmes, 11p to running the organisation, 7p to raising the next pound. The middle number is the one funders ask about.' },
        { id: 'web', label: 'Web edition', on: false, h: 'Online edition', b: 'A shareable web version alongside the PDF, so the report can be linked rather than attached.' },
      ],
      chart: {
        label: 'Girls completing the school year',
        bars: [
          { l: '2023', v: 118, point: 'The baseline year, before the water tanks. Attendance fell every dry season.' },
          { l: '2024', v: 164, point: 'The first two tanks went in. The dry-season drop halved.' },
          { l: '2025', v: 203, point: 'Transport stipends added. Growth continued, but slower, which told us stipends were not the constraint.' },
          { l: '2026', v: 287, point: 'Four more tanks and a term-time meal. The steepest year, and the cheapest per girl.' },
        ],
      },
    },
  },

  'interactive-data-visualisation': {
    kind: 'document',
    document: {
      title: 'Where the nine days went',
      client: 'Meridian Group, close review',
      hint: 'Select a bar. The narrative under it is the point that bar is making.',
      manualMin: 300, autoMin: 5,
      modules: [
        { id: 'chart', label: 'The visual', on: true, chart: true },
        { id: 'lead', label: 'The narrative', on: true, h: 'The point', b: 'Nobody was slow. The days were spent waiting for a handover that nobody owned, and waiting does not appear on anyone’s timesheet.' },
        { id: 'method', label: 'Method', on: false, h: 'How it was counted', b: 'Every handover in three consecutive closes, timestamped from the system log rather than from memory.' },
        { id: 'live', label: 'Live refresh', on: false, h: 'It stays current', b: 'Rebuilt on a schedule from the source, so the chart in the board pack is never the one from last quarter.' },
      ],
      chart: {
        label: 'Days per stage of the close',
        bars: [
          { l: 'Entry', v: 1.2, point: 'Data entry was never the problem. It is the smallest bar on the chart, and the one everyone blames.' },
          { l: 'Waiting', v: 4.6, point: 'Half the close. Nobody is working during this bar, which is why it never showed up in a timesheet.' },
          { l: 'Review', v: 1.9, point: 'Real work, and roughly the right size. Leave it alone.' },
          { l: 'Rework', v: 1.3, point: 'Caused almost entirely by the waiting bar: context is lost, so numbers get re-checked.' },
        ],
      },
    },
  },
};

// Any brand service without a hand-built piece still gets an honest one: the studio generator, which draws
// something real in the brand palette regardless of the service it is standing in for.
export function pieceFor(svc) {
  if (!svc) return null;
  const hand = PIECES[svc.slug];
  if (hand) return hand;
  return {
    kind: 'studio',
    studio: {
      mode: 'studies',
      hint: 'Generated here, now, from a seed. Ask for another and the technique changes with it.',
      truth: 'Drawn live in your browser. The delivered work is built to your palette and type.',
      facts: [['On brand', 'Your palette, your type'], ['Reusable', 'Loops, heroes, covers'], ['Reduced motion', 'Holds a still frame']],
    },
  };
}

export default PIECES;
