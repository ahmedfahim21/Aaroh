import { NextResponse } from 'next/server'

/**
 * Proxy endpoint: forwards a signed x402 payment to the merchant's UCP server.
 *
 * POST body:
 *   merchant_url        – base URL of the running merchant server
 *   checkout_session_id – UCP checkout session ID
 *   x_payment           – base64-encoded x402 payment payload (X-PAYMENT header value)
 */
export async function POST(req: Request) {
  try {
    const { merchant_url, checkout_session_id, x_payment } = await req.json() as {
      merchant_url: string
      checkout_session_id: string
      x_payment: string
    }

    if (!merchant_url || !checkout_session_id || !x_payment) {
      return NextResponse.json(
        { error: 'merchant_url, checkout_session_id, and x_payment are required.' },
        { status: 422 },
      )
    }

    const url = `${merchant_url.replace(/\/$/, '')}/checkout-sessions/${checkout_session_id}/complete`
    const merchantRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': x_payment,
        'UCP-Agent': 'profile="browser"',
        'Request-Signature': 'browser',
        'Idempotency-Key': crypto.randomUUID(),
        'Request-Id': crypto.randomUUID(),
      },
      body: JSON.stringify({}),
    })

    const data = await merchantRes.json()

    if (!merchantRes.ok) {
      return NextResponse.json(
        { error: 'Merchant rejected payment.', detail: data },
        { status: merchantRes.status },
      )
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Checkout proxy failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
