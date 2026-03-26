import "server-only";

import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { consumerOrder } from "./schema";

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function saveConsumerOrder(params: {
  orderId: string;
  merchantUrl: string;
  merchantName?: string;
  totalCents?: number;
  lineItems?: Array<{ title: string; quantity: number; price: number }>;
  status?: string;
  paymentType?: string;
  orderData?: Record<string, unknown>;
}) {
  return db.insert(consumerOrder).values({
    orderId: params.orderId,
    merchantUrl: params.merchantUrl,
    merchantName: params.merchantName ?? null,
    totalCents: params.totalCents ?? null,
    lineItems: params.lineItems ?? null,
    status: params.status ?? "completed",
    paymentType: params.paymentType ?? null,
    orderData: params.orderData ?? null,
  });
}

export async function listConsumerOrders() {
  return db
    .select()
    .from(consumerOrder)
    .orderBy(desc(consumerOrder.createdAt));
}
