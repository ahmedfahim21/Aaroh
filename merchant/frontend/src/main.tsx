import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import './index.css'
import App from './App.tsx'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID

// PrivyProvider is rendered conditionally so the app works without the env var.
// Without VITE_PRIVY_APP_ID the wallet connect button is hidden and merchants
// can type their address manually.
const tree = privyAppId ? (
  <PrivyProvider
    appId={privyAppId}
    config={{
      loginMethods: ['wallet'],
      appearance: { theme: 'light', accentColor: '#1e293b' },
      embeddedWallets: { createOnLogin: 'off' },
    }}
  >
    <App />
  </PrivyProvider>
) : (
  <App />
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>{tree}</StrictMode>,
)
