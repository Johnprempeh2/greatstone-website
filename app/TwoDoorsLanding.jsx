// GRE-3778: the frozen landing (Two Doors doors and hero, v15). John froze it, so it moves to the HTML
// engine exactly as it is: this island renders its published blocks from the frozen copy, unchanged.
import { ProofBlocks } from './ProofBlocks.jsx';
import landing from '../next-proof/frozen/two-doors-landing.json';

export default function TwoDoorsLanding({ forms, pagePaths }) {
  return <ProofBlocks data={landing.data} pageSlug="home" pagePaths={pagePaths} forms={forms} />;
}
