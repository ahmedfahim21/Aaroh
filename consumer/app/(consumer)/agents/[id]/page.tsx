import { notFound } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { getAgentById, getSessionRatingSummary } from "@/lib/db/queries-agents";
import { AgentDetailView } from "@/components/agents/agent-detail-view";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    notFound();
  }
  const { id } = await params;
  const agent = await getAgentById(id, session.user.id);
  if (!agent) notFound();
  const rating = await getSessionRatingSummary(id);
  return <AgentDetailView agent={{ ...agent, rating }} />;
}
