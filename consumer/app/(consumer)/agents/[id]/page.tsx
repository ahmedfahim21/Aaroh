import { notFound } from "next/navigation";
import { getAgentById } from "@/lib/db/queries-agents";
import { AgentDetailView } from "@/components/agents/agent-detail-view";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgentById(id);
  if (!agent) notFound();
  return <AgentDetailView agent={agent} />;
}
