/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

/** The id of this build; /version.json holds the id of the newest one. */
declare const __FELIX_VERSION__: string
