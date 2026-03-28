import { NextResponse } from 'next/server'

/**
 * Thin proxy: GET checkout session status from the merchant UCP server.
 *
 * Query params:
 *   merchant_url         – base URL of the running merchant server
 *   checkout_session_id  – UCP checkout session ID
 *
 * Response shape aligns with `ShoppingSession.get_checkout_status` in shopping/session.py.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const merchant_url = searchParams.get('merchant_url')?.trim() ?? ''
    const checkout_session_id = searchParams.get('checkout_session_id')?.trim() ?? ''

    if (!merchant_url || !checkout_session_id) {
      return NextResponse.json(
        { error: 'merchant_url and checkout_session_id query parameters are required.' },
        { status: 422 },
      )
    }

    const url = `${merchant_url.replace(/\/$/, '')}/checkout-sessions/${encodeURIComponent(checkout_session_id)}`
    const merchantRes = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'UCP-Agent': 'profile="browser"',
        'Request-Signature': 'browser',
        'Idempotency-Key': crypto.randomUUID(),
        'Request-Id': crypto.randomUUID(),
      },
    })

    let data: Record<string, unknown>
    const contentType = merchantRes.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      data = (await merchantRes.json()) as Record<string, unknown>
    } else {
      const text = await merchantRes.text()
      if (!merchantRes.ok) {
        return NextResponse.json(
          { error: `Merchant error (${merchantRes.status}): ${text.slice(0, 300)}` },
          { status: merchantRes.status },
        )
      }
      return NextResponse.json({ error: 'Unexpected non-JSON response from merchant.' }, { status: 502 })
    }

    if (!merchantRes.ok) {
      return NextResponse.json(
        { error: 'Merchant rejected status request.', detail: data },
        { status: merchantRes.status },
      )
    }

    const status = typeof data.status === 'string' ? data.status : 'unknown'
    const order = data.order
    const orderId =
      order && typeof order === 'object' && order !== null && 'id' in order
        ? String((order as { id?: unknown }).id ?? '')
        : null
    const completed = status === 'completed' || status === 'complete_in_progress'

    return NextResponse.json({
      checkout_session_id,
      status,
      completed,
      order_id: orderId || null,
      /** Full merchant checkout JSON when completed — line items, payment tx hash, order link */
      ...(completed ? { checkout: data } : {}),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Checkout status proxy failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
