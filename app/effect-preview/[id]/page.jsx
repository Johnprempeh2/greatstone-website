import { notFound } from 'next/navigation';
import { MOTION_EFFECTS } from '../../../next-proof/motion-contract.mjs';
import EffectPreview from './EffectPreview.jsx';

export const metadata = { robots: { index: false, follow: false } };

export default async function EffectPreviewPage({ params }) {
  const { id } = await params;
  const effect = MOTION_EFFECTS.find((item) => item.id === id);
  if (!effect) notFound();
  return <EffectPreview effect={effect} />;
}
