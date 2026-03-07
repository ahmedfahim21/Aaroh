import { getMCPTools } from "@/lib/ai/mcp";

export async function GET() {
  // Use a default session ID for tool listing (not tied to specific chat)
  const tools = await getMCPTools("_tools_list");
  const toolNames = Object.keys(tools);

  return Response.json({
    tools: toolNames.map((name) => ({
      name,
      description: (tools[name] as { description?: string }).description ?? "",
    })),
    connected: toolNames.length > 0,
  });
}
