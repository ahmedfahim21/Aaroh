import { useEffect } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'

type Props = {
  onAddressChange: (address: string) => void
}

function WalletIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M16 11h2a2 2 0 0 1 0 4h-2v-4z" />
      <line x1="6" y1="9" x2="10" y2="9" />
    </svg>
  )
}

export default function WalletConnectSection({ onAddressChange }: Props) {
  const { ready, authenticated, login, logout } = usePrivy()
  const { wallets } = useWallets()

  // Auto-fill address whenever the connected wallet changes
  useEffect(() => {
    if (authenticated && wallets.length > 0) {
      onAddressChange(wallets[0].address)
    }
  }, [authenticated, wallets, onAddressChange])

  if (!ready) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm text-slate-400">Initialising wallet connector…</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-3">
        Connect wallet
      </p>

      {authenticated && wallets.length > 0 ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="font-mono text-sm text-slate-700">
              {wallets[0].address.slice(0, 6)}…{wallets[0].address.slice(-4)}
            </span>
            <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">
              connected
            </span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="text-xs text-slate-400 underline hover:text-slate-600"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={login}
          className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          <WalletIcon />
          Connect wallet
        </button>
      )}

      {authenticated && wallets.length > 0 && (
        <p className="mt-2 text-xs text-slate-400">Address auto-filled below ↓</p>
      )}
    </div>
  )
}
