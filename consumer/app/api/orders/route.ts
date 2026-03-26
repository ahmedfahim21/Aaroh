import { NextResponse } from "next/server";
import { listConsumerOrders } from "@/lib/db/queries-orders";

export async function GET() {
  try {
    const orders = await listConsumerOrders();
    return NextResponse.json({ orders });
  } catch {
    return NextResponse.json({ orders: [] });
  }
}
