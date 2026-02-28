import { createMCPClient } from "@ai-sdk/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

// process.cwd() is the chat/ directory; the MCP server lives one level up
const PROJECT_ROOT = path.resolve(process.cwd(), "..");

let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;

async function getOrCreateClient() {
  if (mcpClient) {
    return mcpClient;
  }

  const merchantUrl =
    process.env.MCP_MERCHANT_URL || "http://localhost:8000";
  const merchantName = process.env.MCP_MERCHANT_NAME || "Artisan India";

  const transport = new StdioClientTransport({
    command: process.env.MCP_UV_PATH || "uv",
    args: [
      "run",
      "--directory",
      PROJECT_ROOT,
      "python",
      "mcp_client.py",
    ],
    env: {
      ...process.env,
      MERCHANT_URL: merchantUrl,
      MERCHANT_NAME: merchantName,
    } as Record<string, string>,
  });

  mcpClient = await createMCPClient({ transport });

  return mcpClient;
}

export async function getMCPTools() {
  try {
    const client = await getOrCreateClient();
    return await client.tools();
  } catch (error) {
    console.error("Failed to get MCP tools:", error);
    mcpClient = null;
    return {};
  }
}

export async function closeMCPClient() {
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
  }
}
