// This would be app/page.tsx
import Chat from '@/components/Chat';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <Chat />
    </main>
  );
}
