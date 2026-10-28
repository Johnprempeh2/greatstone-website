// The interview data processing agreement, template v2, as John approved it on 25 Oct 2026 (GRE-2639, document `dpa`,
// revision c5b3ddf6-2c78-4042-8581-ef4542c35bdb). The client accepts this text in the app (GRE-2794). Harbor owns the words: copy them
// here unchanged, from "## Data processing agreement" to the end (the template's working notes above it are not part of
// the agreement). Any change to the text is a new version: add a new file, point CURRENT in ../agreement.mjs at it, and
// every organisation must accept again before new invites go out.
export const VERSION = 'v2';
export const SOURCE = { issue: 'GRE-2639', document: 'dpa', revisionId: 'c5b3ddf6-2c78-4042-8581-ef4542c35bdb', approvedOn: '2026-10-25' };
export const TEXT = `## Data processing agreement

**Between**

1. **[Client legal name]**, a company registered in [country] with number [number], whose registered office is at [address] (the **Controller**); and
2. **Greatstone International Limited**, a company registered in England and Wales with number 06248967, whose registered office is at Parley Brook Farm, Littlewick Road, Woking, Surrey, GU21 4XR (the **Processor**).

This agreement forms part of the engagement agreement dated [date] for [engagement name] (the **Engagement**). If the two conflict on personal data, this agreement wins.

### 1. Definitions

Words such as *personal data*, *processing*, *data subject*, *personal data breach*, *controller* and *processor* have the meanings in the UK GDPR and the Data Protection Act 2018 (**Data Protection Law**). Where EU GDPR also applies to the Controller, Data Protection Law includes it.

- **Interview Data**: personal data of Participants processed for the Engagement, listed in Schedule 1.
- **Participant**: a member of the Controller's staff (or another person the Controller names) invited to take part in a discovery interview.
- **Readout**: the session at which the Processor presents the released findings of the Engagement to the Controller. Its date is recorded in the Engagement settings.
- **Themes**: the aggregated findings across Participants (patterns, counts, time estimates and, where a Participant agreed, short quotes), from which no Participant can reasonably be identified unless the Participant agreed to be named.

### 2. Roles and instructions

2.1 The Controller is the controller and the Processor is the processor of Interview Data.

2.2 The Processor processes Interview Data only on the Controller's documented instructions. This agreement and the Engagement agreement are those instructions. The Processor tells the Controller at once if it thinks an instruction breaks Data Protection Law.

2.3 The Controller confirms it has a lawful basis to ask its staff to take part, and that it has told Participants the interview is voluntary. The Processor shows each Participant the privacy notice in Schedule 4 and records their agreement before the interview starts.

2.4 **What the Controller receives.** The Controller receives Themes only, through a released synthesis. The Controller does not receive transcripts, audio or individual answers. A short quote is shared only if the Participant agreed to it at sign-off, and carries the Participant's name only if the Participant chose that. The Processor does not tell the Controller who declined to take part, who stopped or who deleted their data.

2.5 The Controller must not ask the Processor to identify a Participant behind an anonymised quote or theme, and the Processor will refuse such a request.

### 3. Processor duties

The Processor will:

1. keep Interview Data confidential, and make sure everyone who can access it is bound by confidentiality;
2. apply the security measures in Schedule 3;
3. use sub-processors only as clause 4 allows;
4. help the Controller, by appropriate technical and organisational measures, to answer Participants who use their rights (clause 6);
5. help the Controller with security, breach notification, data protection impact assessments and prior consultation, as far as the nature of the processing and the information available to the Processor allow;
6. delete Interview Data as clause 7 says;
7. make available the information needed to show compliance with this agreement, and allow audits as clause 9 says;
8. not use Interview Data to train or improve any model, and not sell it or use it for any purpose outside the Engagement.

### 4. Sub-processors

4.1 The Controller gives general authorisation for the sub-processors in Schedule 2.

4.2 The Processor will tell the Controller at least 14 days before it adds or replaces a sub-processor. The Controller may object on reasonable data-protection grounds within that time. If the parties cannot agree, the Controller may end the affected part of the Engagement.

4.3 The Processor puts data-protection terms on each sub-processor that give at least the protection of this agreement, and stays liable to the Controller for each sub-processor's performance.

### 5. Location and international transfers

5.1 The locations of processing are listed per sub-processor in Schedule 2.

5.2 Some sub-processors process Interview Data in the United States (Schedule 2). For each transfer outside the UK, the Processor relies on: (a) the UK Extension to the EU-US Data Privacy Framework, where the sub-processor is certified; or (b) the ICO's International Data Transfer Agreement, or the International Data Transfer Addendum to the EU Standard Contractual Clauses, in the sub-processor's data processing terms. The Processor has assessed these transfers and will give the Controller a copy of the relevant terms and its transfer risk assessment on request.

5.3 The Controller authorises the transfers in Schedule 2. The Processor tells Participants in the privacy notice (Schedule 4) that their data is processed in the United States and under which safeguards.

5.4 The Processor will not move Interview Data to any other country without notice under clause 4.2.

### 6. Participants' rights

6.1 Each Participant can, from their website account at any time, **see** the Interview Data held about them and **delete** it. Deletion removes the Participant's answers, audio, transcripts and extracted insights, and withdraws them from any synthesis not yet released. If a synthesis was already released, the Processor removes the Participant's quotes from it and re-runs the synthesis before the next release.

6.2 If a Participant asks the Controller (rather than the Processor) to use a right, the Controller passes the request to the Processor, and the Processor acts on it within 10 working days. If a Participant asks the Processor, the Processor acts on it through the self-service tools or by hand, and tells the Controller only that a request was handled, not who made it, unless the law needs otherwise.

### 7. Retention and deletion

7.1 **Default:** the Processor hard-deletes all answers, audio and transcripts of the Engagement, and all extracted insights and quotes tied to a Participant, **90 days after the Readout**. The Controller may ask for a shorter period in writing.

7.2 Before the deletion date, the Processor turns the released Themes into an anonymised version (no names, no quotes that a Participant could be identified by) and keeps that version for the Controller's records and for the Engagement's deliverables.

7.3 The Processor keeps two content-free records after deletion, because the law or billing needs them: (a) the consent log (which Participant agreed to what, and when; it holds no interview content), kept for 6 years to show the processing and the deletion were lawful; and (b) the usage log (model name, token counts and cost; no content, no Participant identity).

7.4 If the Engagement ends early, clause 7.1 runs from the end date instead of the Readout.

7.5 The Processor confirms each deletion to the Controller in writing.

### 8. Personal data breaches

The Processor tells the Controller without undue delay, and in any case within 48 hours, after it becomes aware of a personal data breach affecting Interview Data. It gives what is then known (what happened, what data and how many Participants, likely effects, what it has done) and updates the Controller as it learns more.

### 9. Audit

The Processor answers the Controller's reasonable written questions about its compliance, at most once a year unless there is a breach or a regulator asks. Any on-site audit needs 30 days' notice, happens in working hours, and is at the Controller's cost.

### 10. Liability, term and law

10.1 Each party's liability under this agreement is as set out in the Engagement agreement.

10.2 This agreement lasts as long as the Processor holds Interview Data.

10.3 This agreement is governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.

**Signed for the Controller:** [name, role, date]

**Signed for Greatstone International Limited:** [name, role, date]

---

## Schedule 1: Details of processing

| Item | Detail |
|---|---|
| Subject matter | Discovery interviews with Participants about how work gets done, to find slow and repetitive work the Controller can improve. |
| Duration | From the first invite until deletion under clause 7. |
| Nature | An AI interviewer asks questions by text or voice; answers are recorded, transcribed, analysed into insights, and rolled up into Themes. Greatstone staff check the synthesis before it is released to the Controller. |
| Data subjects | Participants (the Controller's staff the Controller invites). |
| Personal data | Name and work email (from the website account); role and team; interview answers as text; voice audio (streamed only, not stored, if voice is used) and its transcript; extracted insights (tasks, time estimates, pain points, quotes); consent choices; technical data (sign-in times, IP address in short-lived server logs). |
| Special category data | Not sought. Participants are told not to share health, union or similar details. If shared, it is excluded from Themes and deleted with the rest. |
| Purpose | Prepare the Engagement findings for the Controller. Nothing else. |

## Schedule 2: Sub-processors

Facts checked on 25 Oct 2026. Region decision: John, 25 Oct 2026, keep processing as it is (US) with safeguards. **Before signing:** Bedrock confirms the Neon row (GRE-2653) and Harbor confirms Deepgram's transfer basis; both are marked *to confirm*.

| Sub-processor | What it does | Data it sees | Where processed | Transfer basis |
|---|---|---|---|---|
| Anthropic PBC (Claude API) | Runs the interview, extracts insights, writes the synthesis | Answers, transcripts, insights | United States | Anthropic DPA with EU SCCs and the UK Addendum. No training on API data. |
| Deepgram, Inc. | Live speech-to-text and text-to-speech for voice interviews | Voice audio (streamed, not stored) and transcript | United States. \`mip_opt_out\` is on, so Deepgram does not store audio or text after the response. | Deepgram DPA with SCCs and UK Addendum (*to confirm*; DPF status *to confirm*). |
| Netlify, Inc. | Hosts the website, runs the server functions, operates the database | All Interview Data | United States (functions region \`us-east-2\`, Ohio) | EU-US DPF and UK Extension (certified). |
| Neon (Databricks), via Netlify Database | Stores the database | All stored Interview Data | *To confirm* (Bedrock reads the database host region) | Neon DPA with DPF / SCCs (*to confirm* with the region). |

## Schedule 3: Security measures

- Sign-in only with the Participant's own website account; per-engagement invite link checked against allowed email domain and seat count. No anonymous access.
- Every interview record carries the Controller's organisation id and the Participant's user id; database row-level security limits each Participant to their own rows and each organisation to its own data.
- The Controller sees only a synthesis that Greatstone staff have released.
- Encryption in transit (TLS) and at rest (provider default).
- Secrets held in the hosting provider's environment, never in code.
- Access to raw Interview Data limited to named Greatstone staff working on the Engagement.
- Per-person spending and token caps, and a kill switch for voice.
- Deletion jobs logged and confirmed to the Controller.

## Schedule 4: Privacy notice shown to Participants

The text in the \`privacy-notice\` document on GRE-2639, as signed off.
`;
