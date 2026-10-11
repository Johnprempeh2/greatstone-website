// Client portal wording. Harbor's (GRE-1258, document `wording`, revision 3, approved by John 11 Oct 2026), copied
// exactly; Lintel does not write or change it. Words in {braces} are filled at render time from the document and
// the signer's account ({company} is the company name on the client account, read-only). Change the text here and
// nowhere else.
export const WORDING_REVISION = 'GRE-1258 wording r3';

// 1. Next to the unticked box when a client accepts a pack or terms.
export const ACCEPT_CONFIRMATION =
  'I have read {title} (version {version}) and accept it on behalf of {company}. I confirm I am authorised to do this, and that the name I typed above is my signature.';

// 2. Next to the unticked box at the end of a GITA, and the line under the panel.
export const AGREE_CONFIRMATION =
  'On behalf of {company}, I agree in principle with {title} (version {version}). This agreement in principle is not a contract and does not commit either side to any fee, scope, work or delivery date. Any commercial commitment will be set out in documents that both sides accept separately.';
export const AGREE_NEXT_LINE = 'Agreeing in principle tells us you want to move forward. We will contact you about next steps.';

// 3. Small text under every action panel and on the receipt. {privacy_link} is the link text "Privacy notice".
export const PRIVACY_NOTE_TITLE = 'What we record when you accept or agree.';
export const PRIVACY_NOTE_BODY =
  'Your name and job title as you typed them, your company and the email of the account you are signed in with, the exact wording you confirmed, the document version and the time on our server. We do not record your IP address. We keep this as a record of what you accepted or agreed. Our {privacy_link} explains how long we keep it and your rights.';
export const PRIVACY_LINK_TEXT = 'Privacy notice';
export const PRIVACY_HREF = '#privacy';

/** The wording for a document's action, with the placeholders filled. Unknown placeholders stay visible. */
export function fillWording(template, { title = '', version = '', company = '' } = {}) {
  const v = { title, version: String(version), company };
  return String(template || '').replace(/\{(title|version|company)\}/g, (_, k) => v[k]);
}

export const confirmationTemplate = (action) =>
  action === 'agree_in_principle' ? AGREE_CONFIRMATION : action === 'accept' ? ACCEPT_CONFIRMATION : '';
