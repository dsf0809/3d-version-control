import SharedViewer from '@/components/shared-viewer';
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <SharedViewer token={(await params).token} />;
}
