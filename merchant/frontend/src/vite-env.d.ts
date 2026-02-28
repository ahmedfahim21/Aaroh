/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
