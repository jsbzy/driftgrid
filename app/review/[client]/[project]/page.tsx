import type { Metadata } from 'next';
import { Viewer } from '@/components/Viewer';
import { getManifest } from '@/lib/manifest';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ client: string; project: string }>;
}): Promise<Metadata> {
  const { client, project } = await params;
  const manifest = await getManifest(client, project);
  const name = manifest?.project.name ?? project;
  const clientName = client.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return {
    title: `${name} — ${clientName}`,
  };
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ client: string; project: string }>;
}) {
  const { client, project } = await params;
  return <Viewer client={client} project={project} mode="client" />;
}
