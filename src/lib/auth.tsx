import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Profile } from './supabase'

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; notice: string | null }
  | { status: 'ready'; profile: Profile }

type AuthContextValue = {
  state: AuthState
  signOut: () => Promise<void>
  reloadProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    // Only store the session here; loading the profile happens in the effect
    // below, because Supabase must not be called from inside this callback.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  const loadProfile = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, username, panel, meslek_id, active')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      setNotice('Bilgileriniz yüklenemedi. Bağlantınızı kontrol edip tekrar giriş yapın.')
      await supabase.auth.signOut()
      return
    }
    if (!data || !data.active) {
      // The account was removed while this device was still signed in.
      setNotice('Bu hesap artık kullanılmıyor. Yöneticinize söyleyin.')
      await supabase.auth.signOut()
      return
    }
    setProfile(data as Profile)
  }, [userId])

  useEffect(() => {
    if (session === undefined) return
    if (!userId) {
      setProfile(null)
      return
    }
    setProfile(undefined)
    void loadProfile()
  }, [session === undefined, userId, loadProfile])

  const signOut = useCallback(async () => {
    setNotice(null)
    await supabase.auth.signOut()
  }, [])

  const state: AuthState = useMemo(() => {
    if (session === undefined) return { status: 'loading' }
    if (!session) return { status: 'signedOut', notice }
    if (!profile) return { status: 'loading' }
    return { status: 'ready', profile }
  }, [session, profile, notice])

  const value = useMemo(
    () => ({ state, signOut, reloadProfile: loadProfile }),
    [state, signOut, loadProfile],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

/** The signed-in person. Only call inside the signed-in part of the app. */
export function useProfile(): Profile {
  const { state } = useAuth()
  if (state.status !== 'ready') throw new Error('useProfile used while signed out')
  return state.profile
}
