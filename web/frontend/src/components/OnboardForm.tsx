import { useState } from 'react'
import FileDropZone from './FileDropZone'

type Status = 'idle' | 'loading' | 'success' | 'error'

export default function OnboardForm() {
  const [merchantName, setMerchantName] = useState('')
  const [merchantWallet, setMerchantWallet] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

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
          placeholder="e.g. Artisan India"
        />
      </div>
      <div>
        <label htmlFor="merchant_wallet" className="block text-sm font-medium text-slate-700">
          EVM Wallet Address
        </label>
        <input
          id="merchant_wallet"
          type="text"
          required
          value={merchantWallet}
          onChange={(e) => setMerchantWallet(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="e.g. 0x1234...abcd"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Catalogue file
        </label>
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
        className="w-full rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'loading' ? 'Processing…' : 'Onboard merchant'}
      </button>
    </form>
  )
}
