// GRE-6331: the case-study carousel as an island for any GSAM page: <gs-island name="case-studies"></gs-island>.
// The Case Studies page shows the same cards as the home landing: the release's verified case studies
// (next-proof/case-studies.mjs) or, until there are any, the marked placeholders. data-copy takes the same text fields
// and the showPlaceholders toggle as the landing (next-proof/landing-copy.mjs).
import { ProofBlocks } from './ProofBlocks.jsx';
import { landingData } from '../next-proof/landing-copy.mjs';
import { verifiedCaseStudies } from '../next-proof/case-studies.mjs';

export default function CaseStudiesIsland({ forms, pagePaths, copy, release }) {
  const data = landingData(copy, false, release ? verifiedCaseStudies(release) : []);
  const block = data.content.find((item) => item.type === 'TwoDoorsProof');
  if (!block) return null;
  return <ProofBlocks data={{ ...data, content: [block] }} pageSlug="case-studies" pagePaths={pagePaths} forms={forms} />;
}
