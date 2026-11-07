'use client';

import dynamic from 'next/dynamic';

// The AI Market Intelligence hub the Vite site renders at #ai-market-intelligence (and #intel). It draws with
// WebGL and reads the visitor's interests from the browser, so it renders on the client only.
const IntelHub = dynamic(() => import('../../src/intel/IntelHub.jsx'), { ssr: false });

export default function IntelHubClient() {
  return <IntelHub />;
}
