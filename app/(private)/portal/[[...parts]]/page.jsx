'use client';

import { useParams } from 'next/navigation';
import Portal from '../../../../src/portal/Portal.jsx';
import { parsePortalHash } from '../../../../src/portal/portal-model.mjs';
import { parseInterviewHash } from '../../../../src/portal/interview/route.mjs';
import InterviewRoute from '../../InterviewRoute.jsx';

export default function PortalPage() {
  const { parts = [] } = useParams();
  const hash = '#portal/' + parts.join('/');
  // /portal/interview… is the interview engine, never the portal (GRE-4245), as App.jsx does for the hash.
  if (parseInterviewHash(hash)) return <InterviewRoute />;
  return <Portal route={parsePortalHash(hash)} />;
}
