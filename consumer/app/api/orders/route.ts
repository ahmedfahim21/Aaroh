import { NextResponse } from "next/server";
import { listConsumerOrders } from "@/lib/db/queries-orders";

export async function GET() {
  try {
    const orders = await listConsumerOrders();
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Failed to list consumer orders:", error);
    return NextResponse.json({ orders: [] });
  }
}
