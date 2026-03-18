export default function AgentDetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100dvh-48px)] overflow-hidden">
      {children}
    </div>
  );
}
