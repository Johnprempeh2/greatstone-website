import { SiteFrame } from '../ProofPage.jsx';
import { activeRelease } from '../release-source.js';
import { pageMetadata } from '../page-metadata.mjs';
import './gsam-page.css';

// GS Agentic Manager product page (10 Nov 2026), in code like AI Market Intelligence, so it can show real
// screenshots of GSAM. Copy follows the GSAM draft page of the same name. The pictures are GSAM's own screens
// with example data (its Storybook fixtures and the overnight shots), never a client's instance.
const seo = {
  title: 'GS Agentic Manager · Greatstone International',
  description: 'A digital office for the work that comes round every week: AI agents in clear roles, with your people approving what matters.',
};

export async function generateMetadata() {
  const { release } = await activeRelease();
  return { ...pageMetadata({ path: '/gs-agentic-manager', seo }, release.release.number) };
}

const shot = (name, width, height) => ({ src: `/assets/gsam/${name}.webp`, width, height });

const FEATURES = [
  {
    id: 'agents',
    kicker: 'Agents',
    title: 'An agent team with clear roles',
    text: 'Each agent has a job, a manager and a monthly budget, and works on the tasks you give it. You can see what it is working on, what it has spent and what it has been told, and pause it at any time.',
    points: ['A role and written instructions for every agent', 'A budget that pauses the agent when it is reached', 'Skills it can use, such as your house style'],
    img: shot('agents', 1600, 560),
    alt: 'The Agents list in GS Agentic Manager: each agent with its role, spend this week, model and whether it is running.',
  },
  {
    id: 'decisions',
    kicker: 'Decisions and approvals',
    title: 'Agents stop and ask where you decide',
    text: 'When an agent needs a person, it stops and puts a decision in front of you. Each card says what is waiting, why, and who owns it. You approve, reject, hand it to someone else or give an instruction, and the work carries on.',
    points: ['Sign-off before governed steps, such as spending more or adding an agent', 'Questions answered in a list or one at a time', 'Every answer kept on the task'],
    img: shot('decisions', 1185, 720), narrow: true,
    alt: 'A decision card asking a person to approve a request, with options to approve, reject, reassign or give an instruction.',
  },
  {
    id: 'tasks',
    kicker: 'Tasks and reporting',
    title: 'Every task on record, and a week on one page',
    text: 'Each piece of work is a task with one owner, an agent or a person. Its conversation, files and history stay with it. Once a week you get a short report: what the agents finished, what is stuck and what needs you.',
    points: ['One owner for every task', 'Work that repeats runs on a schedule', 'A weekly report to read or share with your team'],
    img: shot('weekly', 1200, 885), narrow: true,
    alt: 'The weekly report: what needs you, what the agents finished, and what is stuck.',
  },
  {
    id: 'website',
    kicker: 'Website',
    title: 'Your website’s admin, in the same office',
    text: 'Pick a part of a page, describe or draw the change you want, and the website agent drafts it. Nothing goes live until a person approves it and starts a publish. The site’s pages sit in one list, with what is approved, what is a draft and where the plan and the real site disagree.',
    points: ['Changes drafted by an agent, approved by a person', 'Every page and its state in one place', 'Older versions kept, so a change can be undone'],
    img: shot('editor', 1600, 1000),
    alt: 'The website editor showing the Greatstone home page, with the Ask an agent panel open beside it, ready to describe a change.',
    extra: { ...shot('sitemap', 1600, 711), alt: 'The list of the website’s built pages, each with its approval state, menu and last change.' },
  },
  {
    id: 'catalogue',
    kicker: 'Catalogue',
    title: 'Products and content you can trust to be current',
    text: 'Products, categories, team, redirects, forms and media live in collections. New records start as drafts and go through review, so only approved records reach the website.',
    points: ['Search across the whole catalogue', 'Drafts and reviews before anything is public', 'Imports that keep what a person has edited'],
    img: shot('catalogue', 1600, 1000),
    alt: 'The Products collection in GS Agentic Manager: a searchable list of products, each marked draft or in review.',
  },
  {
    id: 'tutorials',
    kicker: 'Tutorials',
    title: 'Learn it in short tours',
    text: 'Short guided tours, grouped by area, show your team around: tasks, decisions, agents, the website and more. Start or replay one at any time, and look up any word in plain English.',
    points: ['A first few tours to cover the basics', 'Show me around, from the page you are on', 'A glossary in plain words'],
    img: shot('tutorials', 1215, 975), narrow: true,
    alt: 'The tutorials page: a short list of first tours, then tours grouped by area with start and replay buttons.',
  },
];

const STARTS_WITH = [
  ['Your own instance', 'A separate, hosted office for your organisation only. Your work and data are not shared with other clients.'],
  ['An agent team set up for your work', 'We start with one area of work, such as operations, research or content, and give each agent a role, instructions and a manager.'],
  ['Connections you agree', 'We connect the systems you agree once a technical check confirms each one. Access is held per agent and can be revoked at any time.'],
  ['Approval points you choose', 'Agents work within budgets and stop for a person wherever you decide they should.'],
  ['A record of every task', 'You can see what each agent did and why, task by task.'],
  ['Hosting and maintenance', 'We host your instance, maintain the platform and keep backups. The terms of this service are written into your agreement.'],
];

const STEPS = [
  ['Executive Discovery', 'Free. Is there something worth exploring?'],
  ['Initial assessment', 'Free. Where technology and AI could help, with an indicative scope.'],
  ['Agreement', 'A written scope and a deposit before any paid work.'],
  ['Deep Dive and blueprint', 'We map how the work is done and give you an actionable blueprint.'],
  ['Digital office', 'Only where it fits: tailored setup, then a recurring service.'],
];

const ENQUIRE = '/contact#enquire/gs-agentic-manager';

function Shot({ src, width, height, alt, eager = false, narrow = false }) {
  return <figure className={'gsam-shot' + (narrow ? ' is-narrow' : '')}>
    <a href={src} target="_blank" rel="noopener" title="Open the full-size screenshot">
      <img src={src} width={width} height={height} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
    </a>
  </figure>;
}

export default async function GsAgenticManagerPage() {
  const { release } = await activeRelease();
  return <SiteFrame release={release}>
    <div className="gsam-page">
      <section className="gsam-hero" aria-labelledby="gsam-title">
        <div className="gsam-hero-copy">
          <div>
            <p className="gsam-kicker">GS Agentic Manager</p>
            <h1 id="gsam-title">A digital office for the work that comes round every week</h1>
          </div>
          <div>
          <p className="gsam-lead">An AI agent team, set up for one area of your work, in your own hosted instance. Your people direct it. Every task is on record, and it stops for a person where you decide.</p>
          <div className="gsam-actions">
            <a className="btn btn--primary" href={ENQUIRE}>Ask about GS Agentic Manager</a>
            <a className="btn btn--ghost" href="#features">See what it does</a>
          </div>
          </div>
        </div>
        <Shot {...shot('agent', 1600, 1000)} alt="An agent’s overview page in GS Agentic Manager: its role, manager, open tasks, model and spend this month." eager />
      </section>

      <section className="gsam-band" aria-labelledby="gsam-who">
        <h2 id="gsam-who">Built for organisations where skilled people do too much repeatable work</h2>
        <ul className="gsam-who">
          <li>You have 11 to 250 people and the same reports, drafts, research and follow-ups come round every week.</li>
          <li>Your team already tries AI tools, but the results depend on who used them and nobody can see what was done.</li>
          <li>You want the hours back without hiring, and without handing control to a black box.</li>
        </ul>
      </section>

      <section id="features" className="gsam-features" aria-labelledby="gsam-features-title">
        <div className="gsam-section-head">
          <h2 id="gsam-features-title">What it does</h2>
          <p>Greatstone runs its own operations on GS Agentic Manager. These are its real screens, shown with example data.</p>
        </div>
        {FEATURES.map((f) => <article key={f.id} id={f.id} className="gsam-feature" aria-labelledby={`gsam-${f.id}`}>
          <div className="gsam-feature-copy">
            <div>
              <p className="gsam-kicker">{f.kicker}</p>
              <h3 id={`gsam-${f.id}`}>{f.title}</h3>
            </div>
            <div>
            <p>{f.text}</p>
            <ul>{f.points.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          </div>
          <div className="gsam-feature-media">
            <Shot {...f.img} narrow={f.narrow} alt={f.alt} />
            {f.extra && <Shot {...f.extra} />}
          </div>
        </article>)}
      </section>

      <section className="gsam-band" aria-labelledby="gsam-starts">
        <h2 id="gsam-starts">What every digital office starts with</h2>
        <div className="gsam-grid">
          {STARTS_WITH.map(([t, d]) => <div key={t} className="gsam-card"><h3>{t}</h3><p>{d}</p></div>)}
        </div>
      </section>

      <section className="gsam-band gsam-two" aria-labelledby="gsam-fit">
        <div>
          <h2 id="gsam-fit">How it fits with our consultancy</h2>
          <p className="gsam-muted">The consultancy comes first. We only propose a digital office where the blueprint shows it fits.</p>
        </div>
        <ol className="gsam-steps">
          {STEPS.map(([t, d]) => <li key={t}><strong>{t}</strong><span>{d}</span></li>)}
        </ol>
      </section>

      <section className="gsam-band" aria-labelledby="gsam-bounds">
        <h2 id="gsam-bounds">Boundaries</h2>
        <p className="gsam-reading">Agents do not move money, sign anything, give regulated advice or make decisions about people. They do not replace your team; they take repeatable work off it. AI use stays within a budget you approve, and work beyond it stops for a person. We do not build bespoke software inside this service. If the work needs any of these, we say so in the Deep Dive and scope it separately.</p>
      </section>

      <section className="gsam-invite" aria-labelledby="gsam-invite">
        <p className="gsam-kicker">Start here</p>
        <h2 id="gsam-invite">Tell us which work keeps coming back</h2>
        <p className="gsam-reading">A free Executive Discovery is usually enough to see whether a digital office would help, and where it would start.</p>
        <a className="btn btn--primary" href={ENQUIRE}>Ask about GS Agentic Manager</a>
      </section>
    </div>
  </SiteFrame>;
}
