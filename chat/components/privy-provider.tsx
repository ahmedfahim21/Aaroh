'use client'

import { PrivyProvider } from '@privy-io/react-auth'

export function PrivyAppProvider({
  appId,
  children,
}: {
  appId: string
  children: React.ReactNode
}) {
  if (!appId) return <>{children}</>
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['wallet'],
        appearance: { theme: 'light', accentColor: '#1e293b' },
        embeddedWallets: { createOnLogin: 'off' },
      }}
    >
      {children}
    </PrivyProvider>
  )
}
