import { redirect } from 'next/navigation';

export default async function EngagementPage({ params }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect('/org');
  redirect(`/org#org/e/${id}`);
}
