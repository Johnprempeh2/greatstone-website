'use client';

import { useParams } from 'next/navigation';
import Portal from '../../../../src/portal/Portal.jsx';
import { parsePortalHash } from '../../../../src/portal/portal-model.mjs';

export default function PortalPage() {
  const { parts = [] } = useParams();
  const route = parsePortalHash('#portal/' + parts.join('/'));
  return <Portal route={route} />;
}
