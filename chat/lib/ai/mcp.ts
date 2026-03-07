import { createMCPClient } from "@ai-sdk/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

// process.cwd() is the chat/ directory; the MCP server lives one level up
const PROJECT_ROOT = path.resolve(process.cwd(), "..");

// Per-session MCP clients to avoid shared state
const mcpClients = new Map<string, Awaited<ReturnType<typeof createMCPClient>>>();

async function getOrCreateClient(sessionId: string, session?: { user?: { nearAccountId?: string } }) {
  // Check if we already have a client for this session
  const existingClient = mcpClients.get(sessionId);
  if (existingClient) {
    return existingClient;
  }

  const merchantUrl =
    process.env.MCP_MERCHANT_URL || "http://localhost:8000";
  const merchantName = process.env.MCP_MERCHANT_NAME || "Artisan India";

  // Get user's NEAR account from session (if available)
  const nearAccountId = session?.user?.nearAccountId;
  const nearNetwork = process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet";

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
      // Pass user-specific NEAR account (optional - only if logged in)
      ...(nearAccountId && {
        NEAR_ACCOUNT_ID: nearAccountId,
        NEAR_NETWORK: nearNetwork,
        NEAR_CONTRACT_ID: nearAccountId, // Each user has their own contract
      }),
    } as Record<string, string>,
  });

  const client = await createMCPClient({ transport });

  // Store client for this session
  mcpClients.set(sessionId, client);

  return client;
}

export async function getMCPTools(
  sessionId: string,
  session?: { user?: { nearAccountId?: string } }
) {
  try {
    const client = await getOrCreateClient(sessionId, session);
    return await client.tools();
  } catch (error) {
    console.error("Failed to get MCP tools:", error);
    // Remove failed client from cache
    mcpClients.delete(sessionId);
    return {};
  }
}

export async function closeMCPClient(sessionId?: string) {
  if (sessionId) {
    // Close specific session's client
    const client = mcpClients.get(sessionId);
    if (client) {
      await client.close();
      mcpClients.delete(sessionId);
    }
  } else {
    // Close all clients (e.g., on server shutdown)
    for (const [id, client] of mcpClients.entries()) {
      await client.close();
      mcpClients.delete(id);
    }
  }
}
