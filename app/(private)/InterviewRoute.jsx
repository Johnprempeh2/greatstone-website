'use client';

// GRE-4245: the interview views (src/portal/interview) at real Next paths. They still route on hashes, so the
// page's path and query are read back as the hash the Vite app would have had, and route.mjs path mode turns
// the views' own hash links and redirects into Next paths.
import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import InterviewApp from '../../src/portal/interview/InterviewApp.jsx';
import { enablePathRoutes, interviewHashOf, parseInterviewHash } from '../../src/portal/interview/route.mjs';

enablePathRoutes();

function Routed() {
  const router = useRouter();
  const hash = interviewHashOf(usePathname(), useSearchParams().toString());
  useEffect(() => enablePathRoutes(router.push), [router]);
  return <InterviewApp route={parseInterviewHash(hash) ?? { view: 'notfound', query: {} }} hash={hash} />;
}

export default function InterviewRoute() {
  return <Suspense fallback={<div style={{ minHeight: '100vh' }} />}><Routed /></Suspense>;
}
