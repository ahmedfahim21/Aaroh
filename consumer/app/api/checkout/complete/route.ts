import { NextResponse } from 'next/server'
import { saveConsumerOrder } from '@/lib/db/queries-orders'

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

    let data: unknown
    const contentType = merchantRes.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      data = await merchantRes.json()
    } else {
      const text = await merchantRes.text()
      if (!merchantRes.ok) {
        return NextResponse.json(
          { error: `Merchant error (${merchantRes.status}): ${text.slice(0, 300)}` },
          { status: merchantRes.status },
        )
      }
      data = { raw: text }
    }

    if (!merchantRes.ok) {
      return NextResponse.json(
        { error: 'Merchant rejected payment.', detail: data },
        { status: merchantRes.status },
      )
    }

    // Save the order to consumer DB for transaction history
    try {
      const orderData = data as Record<string, unknown>
      const orderId = (orderData.id as string) ?? checkout_session_id
      const lineItems = (orderData.line_items as Array<{
        item?: { title?: string; price?: number }
        quantity?: number
      }>) ?? []
      const totals = (orderData.totals as Array<{ type?: string; amount?: number }>) ?? []
      const total = totals.find((t) => t.type === 'total')
      const paymentInstruments = (
        (orderData.payment as Record<string, unknown>)?.instruments as Array<{ type?: string }>
      ) ?? []

      await saveConsumerOrder({
        orderId,
        merchantUrl: merchant_url,
        totalCents: total?.amount,
        lineItems: lineItems.map((li) => ({
          title: li.item?.title ?? 'Item',
          quantity: li.quantity ?? 1,
          price: li.item?.price ?? 0,
        })),
        status: (orderData.status as string) ?? 'completed',
        paymentType: paymentInstruments[0]?.type,
        orderData,
      })
    } catch (error) {
      // Don't fail the checkout if saving to consumer DB fails, but log it for observability.
      console.error('Failed to save consumer order for transaction history:', error)
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Checkout proxy failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
