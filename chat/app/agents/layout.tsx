export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[calc(100dvh-48px)] overflow-hidden">
      {children}
    </div>
  );
}
