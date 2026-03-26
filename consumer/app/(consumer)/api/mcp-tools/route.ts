import { getMCPTools } from "@/lib/ai/mcp";

export async function GET() {
  const tools = await getMCPTools();
  const toolNames = Object.keys(tools);

  return Response.json({
    tools: toolNames.map((name) => ({
      name,
      description: (tools[name] as { description?: string }).description ?? "",
    })),
    connected: toolNames.length > 0,
  });
}
