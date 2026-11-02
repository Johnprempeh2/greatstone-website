import { waitingForYou } from './portal-model.mjs';

// The home lists only actions confirmed by the two signed-in website feeds.
export function currentClientActions(docs = [], acceptances = [], email, snapshot) {
  const documentActions = waitingForYou(docs, { email, acceptances })
    .map((doc) => ({ id: `document:${doc.id}`, title: doc.title, detail: 'Read and respond to this document',
      href: `#portal/doc/${doc.id}` }));
  const requests = (snapshot?.documentRequests || []).filter((request) => request.status === 'open')
    .map((request) => ({ id: `request:${request.id}`, title: request.title,
      detail: 'Send the requested information', href: '#portal/deep-dive' }));
  return [...requests, ...documentActions];
}
