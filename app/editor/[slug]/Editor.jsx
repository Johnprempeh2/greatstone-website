'use client';

import { Puck } from '@puckeditor/core';
import { proofConfig } from '../../ProofBlocks.jsx';

export default function Editor({ page, slug }) {
  const exportDraft = (data) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug}-draft.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return <Puck config={proofConfig} data={page.data}
    headerTitle={page.title} headerPath={slug === 'home' ? '/' : `/${slug}`}
    dictionary={{ 'header-publish': 'Export draft' }}
    iframe={{ enabled: true, syncHostStyles: true }}
    viewports={[{ width: 390, label: 'Phone', icon: 'Smartphone' }, { width: 1440, label: 'Laptop', icon: 'Monitor' }]}
    onPublish={exportDraft} />;
}
