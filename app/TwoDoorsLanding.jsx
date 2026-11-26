// GRE-3778: the frozen landing (Two Doors doors and hero, v15). John froze its layout, images, motion and
// styling; its words are his to change from GSAM's Website module (8 Nov, next-proof/landing-copy.mjs).
// GRE-6331: its case-study section shows the release's verified case studies (from the Case Studies page) or,
// until there are any, the marked placeholders.
import { ProofBlocks } from './ProofBlocks.jsx';
import { landingData } from '../next-proof/landing-copy.mjs';
import { verifiedCaseStudies } from '../next-proof/case-studies.mjs';

export default function TwoDoorsLanding({ forms, pagePaths, copy, release, markFields = false }) {
  const cases = release ? verifiedCaseStudies(release) : [];
  return <ProofBlocks data={landingData(copy, markFields, cases)} pageSlug="home" pagePaths={pagePaths} forms={forms} />;
}
