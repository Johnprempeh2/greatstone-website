// Company facts the legal pages state (GRE-656 legal doc v3, "Company details"; John approved the text and
// chose the contact address on 5 Oct 2026). One place, so the Privacy, Cookie and Terms pages, and the
// launch check, never disagree. Store-free so node --test and scripts can read it.

export const LEGAL_NAME = 'Greatstone International Limited';
export const COMPANY_NUMBER = '06248967';
export const REGISTERED_IN = 'England and Wales';
export const REGISTERED_OFFICE = 'Parley Brook Farm, Littlewick Road, Woking, Surrey, GU21 4XR';
export const LEGAL_CONTACT_EMAIL = 'dx@greatstonesoftware.co.uk';
// The date the three pages show as "Last updated". Change it whenever their wording changes.
export const LEGAL_UPDATED = '6 October 2026';

// GRE-656 gap 4. John is registering with the ICO (5 Oct: "I will pay the fee"). Until the number is here the
// Privacy page leaves the sentence out, and `npm run launch:check` FAILS, so the pages cannot go live
// without it (John: "The pages do not go live until then").
export const ICO_REGISTRATION_NUMBER = '';

/** Problems that must be fixed before the legal pages go live. Empty = ready. */
export function legalLaunchGaps({ ico = ICO_REGISTRATION_NUMBER } = {}) {
  const gaps = [];
  if (!/^[A-Z]{1,2}\d{6,8}$|^\d{8}$/.test(String(ico || '').trim())) gaps.push('ICO registration number is not set (src/lib/legal-facts.mjs, GRE-656 gap 4).');
  return gaps;
}
