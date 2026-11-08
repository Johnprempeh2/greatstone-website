// GRE-3778: the frozen landing (Two Doors doors and hero, v15). John froze its layout, images, motion and
// styling; its words are his to change from GSAM's Website module (8 Nov, next-proof/landing-copy.mjs).
import { ProofBlocks } from './ProofBlocks.jsx';
import { landingData } from '../next-proof/landing-copy.mjs';

export default function TwoDoorsLanding({ forms, pagePaths, copy, markFields = false }) {
  return <ProofBlocks data={landingData(copy, markFields)} pageSlug="home" pagePaths={pagePaths} forms={forms} />;
}
