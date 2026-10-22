import { enquiryPayload, makeEnquiryClient } from './enquiry.mjs';

// The two tools share one transport. Their result remains visible if this send fails.
const client = makeEnquiryClient();
export function sendToolLead({ name, company, email, interest, summary, attribution, page, website, turnstile }, send = client.send) {
  return send(enquiryPayload({ name, company, email, interest, message: summary, website, turnstile }, attribution, page));
}
