import "server-only";

import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { agent, agentSession } from "./schema";
import type { Agent, AgentSession, AgentWithStats } from "./schema";

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function createAgent(data: {
  id: string;
  userId: string;
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

export async function listAgentsForUser(userId: string): Promise<Agent[]> {
  return db
    .select()
    .from(agent)
    .where(eq(agent.userId, userId))
    .orderBy(agent.createdAt);
}

/** Agents with session count and like/dislike counts for the grid. */
export async function listAgentsWithStatsForUser(userId: string): Promise<AgentWithStats[]> {
  const agents = await listAgentsForUser(userId);
  if (agents.length === 0) {
    return [];
  }
  const ids = agents.map((a) => a.id);

  const sessionRows = await db
    .select({
      agentId: agentSession.agentId,
      sessionCount: sql<number>`count(*)::int`,
    })
    .from(agentSession)
    .where(inArray(agentSession.agentId, ids))
    .groupBy(agentSession.agentId);

  const ratingRows = await db
    .select({
      agentId: agentSession.agentId,
      liked: sql<number>`count(*) filter (where ${agentSession.rating} = true)::int`,
      disliked: sql<number>`count(*) filter (where ${agentSession.rating} = false)::int`,
    })
    .from(agentSession)
    .where(and(inArray(agentSession.agentId, ids), isNotNull(agentSession.rating)))
    .groupBy(agentSession.agentId);

  const sessionMap = new Map(sessionRows.map((r) => [r.agentId, r.sessionCount]));
  const ratingMap = new Map(
    ratingRows.map((r) => [r.agentId, { liked: r.liked, disliked: r.disliked }]),
  );

  return agents.map((a) => {
    const rt = ratingMap.get(a.id);
    return {
      ...a,
      sessionCount: sessionMap.get(a.id) ?? 0,
      ratingLiked: rt?.liked ?? 0,
      ratingDisliked: rt?.disliked ?? 0,
    };
  });
}

export async function getSessionRatingSummary(agentId: string): Promise<{
  liked: number;
  disliked: number;
}> {
  const [row] = await db
    .select({
      liked: sql<number>`count(*) filter (where ${agentSession.rating} = true)::int`,
      disliked: sql<number>`count(*) filter (where ${agentSession.rating} = false)::int`,
    })
    .from(agentSession)
    .where(and(eq(agentSession.agentId, agentId), isNotNull(agentSession.rating)));

  return {
    liked: row?.liked ?? 0,
    disliked: row?.disliked ?? 0,
  };
}

/** When userId is provided, only return the row if it belongs to that user. */
export async function getAgentById(id: string, userId?: string): Promise<Agent | undefined> {
  if (userId) {
    const [row] = await db
      .select()
      .from(agent)
      .where(and(eq(agent.id, id), eq(agent.userId, userId)));
    return row;
  }
  const [row] = await db.select().from(agent).where(eq(agent.id, id));
  return row;
}

export async function getAgentDetailById(
  id: string,
  userId: string
): Promise<(Agent & { rating: { liked: number; disliked: number } }) | undefined> {
  const [row] = await db
    .select({
      id: agent.id,
      userId: agent.userId,
      name: agent.name,
      instructions: agent.instructions,
      walletAddress: agent.walletAddress,
      erc8004Id: agent.erc8004Id,
      createdAt: agent.createdAt,
      liked: sql<number>`(
        select count(*)::int
        from ${agentSession}
        where ${agentSession.agentId} = ${agent.id} and ${agentSession.rating} = true
      )`,
      disliked: sql<number>`(
        select count(*)::int
        from ${agentSession}
        where ${agentSession.agentId} = ${agent.id} and ${agentSession.rating} = false
      )`,
    })
    .from(agent)
    .where(and(eq(agent.id, id), eq(agent.userId, userId)));

  if (!row) return undefined;
  const { liked, disliked, ...rest } = row;
  return { ...rest, rating: { liked: liked ?? 0, disliked: disliked ?? 0 } };
}

export async function deleteAgentForUser(id: string, userId: string): Promise<Agent | undefined> {
  const [row] = await db
    .delete(agent)
    .where(and(eq(agent.id, id), eq(agent.userId, userId)))
    .returning();
  return row;
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
    rating?: boolean | null;
  }
): Promise<void> {
  await db.update(agentSession).set(data).where(eq(agentSession.id, id));
}

export async function rateSession(
  sessionId: string,
  agentId: string,
  rating: boolean,
): Promise<AgentSession | undefined> {
  const [row] = await db
    .update(agentSession)
    .set({ rating })
    .where(and(eq(agentSession.id, sessionId), eq(agentSession.agentId, agentId)))
    .returning();
  return row;
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
