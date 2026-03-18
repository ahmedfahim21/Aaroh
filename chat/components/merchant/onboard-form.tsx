'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileDropZone } from './file-drop-zone'
import { WalletConnectSection } from './wallet-connect-section'

type Status = 'idle' | 'loading' | 'success' | 'error'

type Props = {
  privyEnabled: boolean
}

export function OnboardForm({ privyEnabled }: Props) {
  const [merchantName, setMerchantName] = useState('')
  const [merchantWallet, setMerchantWallet] = useState('')
  const [walletFromPrivy, setWalletFromPrivy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  const handleWalletAddress = useCallback((address: string) => {
    setMerchantWallet(address)
    setWalletFromPrivy(true)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!merchantName.trim() || !merchantWallet.trim() || !file) {
      setStatus('error')
      setMessage('Please fill in all fields and upload a catalogue file.')
      return
    }

    setStatus('loading')
    setMessage('')

    const formData = new FormData()
    formData.set('merchant_name', merchantName.trim())
    formData.set('merchant_wallet', merchantWallet.trim())
    formData.set('catalogue', file)

    try {
      const res = await fetch('/api/onboard', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus('error')
        setMessage(data.detail ?? res.statusText ?? 'Onboarding failed.')
        return
      }
      // Register merchant in DB for discovery by agents
      const slug: string = data.slug ?? data.merchant_name?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown'
      await fetch('/api/merchants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          name: data.merchant_name ?? merchantName.trim(),
          walletAddress: merchantWallet.trim(),
          categories: data.categories ?? '',
        }),
      }).catch(() => { /* non-fatal if merchant already exists */ })
      setStatus('success')
      setMessage(`Onboarded "${data.merchant_name}" successfully.`)
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Network error.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {privyEnabled && <WalletConnectSection onAddressChange={handleWalletAddress} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="merchant_name">Merchant name</Label>
        <Input
          id="merchant_name"
          type="text"
          required
          value={merchantName}
          onChange={(e) => setMerchantName(e.target.value)}
          placeholder="e.g. Green Craft Co."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="merchant_wallet">EVM wallet address</Label>
        <div className="relative">
          <Input
            id="merchant_wallet"
            type="text"
            required
            value={merchantWallet}
            onChange={(e) => {
              setMerchantWallet(e.target.value)
              setWalletFromPrivy(false)
            }}
            placeholder="0x1234…abcd"
            className={walletFromPrivy ? 'border-green-400 pr-28 dark:border-green-600' : 'pr-28'}
          />
          {walletFromPrivy && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-green-600 dark:text-green-400">
              ✓ from wallet
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label>Catalogue file</Label>
          <a
            href="/example-catalogue.csv"
            download="example-catalogue.csv"
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Download example CSV
          </a>
        </div>
        <FileDropZone value={file} onChange={setFile} disabled={status === 'loading'} />
      </div>

      {status === 'success' && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
          {message}
        </div>
      )}
      {status === 'error' && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {message}
        </div>
      )}

      <Button type="submit" disabled={status === 'loading'} className="w-full">
        {status === 'loading' ? 'Processing…' : 'Onboard merchant'}
      </Button>
    </form>
  )
}
