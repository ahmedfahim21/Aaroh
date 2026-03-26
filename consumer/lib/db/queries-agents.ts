import "server-only";

import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { agent, agentSession } from "./schema";
import type { Agent, AgentSession } from "./schema";

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function createAgent(data: {
  id: string;
  name: string;
  instructions: string;
  walletAddress: string;
  erc8004Id?: string | null;
}): Promise<Agent> {
  const [row] = await db.insert(agent).values(data).returning();
  return row;
}

export async function updateAgentErc8004Id(id: string, erc8004Id: string): Promise<void> {
  await db.update(agent).set({ erc8004Id }).where(eq(agent.id, id));
}

export async function listAgents(): Promise<Agent[]> {
  return db.select().from(agent).orderBy(agent.createdAt);
}

export async function getAgentById(id: string): Promise<Agent | undefined> {
  const [row] = await db.select().from(agent).where(eq(agent.id, id));
  return row;
}

export async function deleteAgent(id: string): Promise<void> {
  await db.delete(agent).where(eq(agent.id, id));
}

export async function createSession(data: {
  id: string;
  agentId: string;
  task: string;
}): Promise<AgentSession> {
  const [row] = await db
    .insert(agentSession)
    .values({ ...data, status: "running", events: [] })
    .returning();
  return row;
}

export async function updateSession(
  id: string,
  data: {
    status: "running" | "done" | "failed";
    result?: string | null;
    events?: Record<string, unknown>[];
    completedAt?: Date;
  }
): Promise<void> {
  await db.update(agentSession).set(data).where(eq(agentSession.id, id));
}

export async function listSessionsByAgentId(agentId: string): Promise<AgentSession[]> {
  return db
    .select()
    .from(agentSession)
    .where(eq(agentSession.agentId, agentId))
    .orderBy(desc(agentSession.createdAt));
}

export async function getSessionById(id: string): Promise<AgentSession | undefined> {
  const [row] = await db.select().from(agentSession).where(eq(agentSession.id, id));
  return row;
}
