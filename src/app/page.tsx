import dynamic from 'next/dynamic';

const InkprintApp = dynamic(
  () => import('@/components/compose/InkprintApp').then((mod) => mod.InkprintApp),
);

export default function Home() {
  return (
    <main className="flex flex-1 flex-col bg-background text-foreground">
      <InkprintApp />
    </main>
  );
}
