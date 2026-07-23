import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let active = true
    let requestId = 0

    async function applySession(nextSession) {
      const currentRequest = ++requestId
      if (!active) return

      setSession(nextSession)
      setAuthError('')

      if (!nextSession) {
        setProfile(null)
        setLoading(false)
        return
      }

      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', nextSession.user.id)
        .single()

      if (!active || currentRequest !== requestId) return

      if (error) {
        setProfile(null)
        setAuthError(error.message)
      } else {
        setProfile(data)
      }
      setLoading(false)
    }

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setAuthError(error.message)
          setLoading(false)
          return
        }
        applySession(data.session)
      })
      .catch((error) => {
        if (!active) return
        setAuthError(error.message)
        setLoading(false)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession)
    })

    return () => {
      active = false
      requestId += 1
      listener.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
    return { error }
  }

  async function signOut() {
    setAuthError('')
    const { error } = await supabase.auth.signOut()
    if (error) setAuthError(error.message)
    return { error }
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, authError, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
