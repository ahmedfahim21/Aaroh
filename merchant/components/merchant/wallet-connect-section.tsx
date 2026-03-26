'use client'

import { useEffect } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { Button } from '@/components/ui/button'

type Props = {
  onAddressChange: (address: string) => void
}

export function WalletConnectSection({ onAddressChange }: Props) {
  const { ready, authenticated, login, logout } = usePrivy()
  const { wallets } = useWallets()

  useEffect(() => {
    if (authenticated && wallets.length > 0) {
      onAddressChange(wallets[0].address)
    }
  }, [authenticated, wallets, onAddressChange])

  if (!ready) {
    return (
      <div className="rounded-md border bg-muted/40 p-4">
        <p className="text-sm text-muted-foreground">Initialising wallet connector…</p>
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-card p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Connect wallet
      </p>

      {authenticated && wallets.length > 0 ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="font-mono text-sm">
              {wallets[0].address.slice(0, 6)}…{wallets[0].address.slice(-4)}
            </span>
            <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
              connected
            </span>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={logout}>
            Disconnect
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={login}>
          Connect wallet
        </Button>
      )}

      {authenticated && wallets.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">Address auto-filled below ↓</p>
      )}
    </div>
  )
}
