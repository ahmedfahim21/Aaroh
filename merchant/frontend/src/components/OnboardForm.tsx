import { useCallback, useState } from 'react'
import FileDropZone from './FileDropZone'
import WalletConnectSection from './WalletConnectSection'

type Status = 'idle' | 'loading' | 'success' | 'error'

// Privy wallet connect is shown only when the app ID is configured.
const privyEnabled = Boolean(import.meta.env.VITE_PRIVY_APP_ID)

export default function OnboardForm() {
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

  const handleWalletInput = (value: string) => {
    setMerchantWallet(value)
    setWalletFromPrivy(false)
  }

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
      const res = await fetch('/api/onboard', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus('error')
        setMessage(data.detail ?? res.statusText ?? 'Onboarding failed.')
        return
      }
      setStatus('success')
      setMessage(`Onboarded "${data.merchant_name}". Output: ${data.output_dir ?? '—'}`)
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Network error.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      {/* Wallet connect — only rendered when PrivyProvider is present */}
      {privyEnabled && (
        <WalletConnectSection onAddressChange={handleWalletAddress} />
      )}

      {/* Merchant name */}
      <div>
        <label htmlFor="merchant_name" className="block text-sm font-medium text-slate-700">
          Merchant name
        </label>
        <input
          id="merchant_name"
          type="text"
          required
          value={merchantName}
          onChange={(e) => setMerchantName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="e.g. Green Craft Co."
        />
      </div>

      {/* EVM wallet address — auto-filled when wallet is connected */}
      <div>
        <label htmlFor="merchant_wallet" className="block text-sm font-medium text-slate-700">
          EVM wallet address
        </label>
        <div className="relative mt-1">
          <input
            id="merchant_wallet"
            type="text"
            required
            value={merchantWallet}
            onChange={(e) => handleWalletInput(e.target.value)}
            className={`block w-full rounded-md border px-3 py-2 pr-28 shadow-sm focus:outline-none focus:ring-1 ${
              walletFromPrivy
                ? 'border-green-300 bg-green-50 focus:border-green-500 focus:ring-green-500'
                : 'border-slate-300 focus:border-slate-500 focus:ring-slate-500'
            }`}
            placeholder="0x1234…abcd"
          />
          {walletFromPrivy && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-green-600">
              ✓ from wallet
            </span>
          )}
        </div>
      </div>

      {/* Catalogue file */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-700">
            Catalogue file
          </label>
          <a
            href="/example-catalogue.csv"
            download="example-catalogue.csv"
            className="text-xs text-slate-500 underline hover:text-slate-700"
          >
            Download example CSV
          </a>
        </div>
        <FileDropZone
          value={file}
          onChange={setFile}
          disabled={status === 'loading'}
        />
      </div>

      {status === 'success' && (
        <div className="rounded-md bg-green-50 p-4 text-sm text-green-800">
          {message}
        </div>
      )}
      {status === 'error' && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-800">
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'loading' ? 'Processing…' : 'Onboard merchant'}
      </button>
    </form>
  )
}
