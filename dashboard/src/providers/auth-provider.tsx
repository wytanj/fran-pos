import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import type { Profile, Company, CompanySettings } from '@pos/shared'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: User | null
  session: Session | null
  profile: Profile | null
  company: Company | null
  settings: CompanySettings | null
  companies: Company[]
  loading: boolean
}

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: (redirectPath?: string) => Promise<void>
  signUp: (email: string, password: string, companyName: string, displayName: string) => Promise<void>
  createCompanyProfile: (companyName: string, displayName: string) => Promise<void>
  signOut: () => Promise<void>
  switchCompany: (companyId: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    company: null,
    settings: null,
    companies: [],
    loading: true,
  })

  const loadUserData = useCallback(async (user: User, session?: Session | null) => {
    try {
      // Get all profiles (companies) for this user
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*, company:companies(*)')
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (profilesError) throw profilesError

      if (!profiles || profiles.length === 0) {
        setState(prev => ({
          ...prev,
          user,
          session: session ?? prev.session,
          profile: null,
          company: null,
          settings: null,
          companies: [],
          loading: false,
        }))
        return
      }

      const companies = profiles.map((p: Profile & { company: Company }) => p.company)

      // Use first company by default, or saved preference
      const savedCompanyId = localStorage.getItem('pos_active_company')
      const activeProfile = profiles.find((p: Profile) => p.company_id === savedCompanyId) || profiles[0]
      const activeCompany = companies.find((c: Company) => c.id === activeProfile.company_id) || companies[0]

      // Load company settings
      const { data: settings, error: settingsError } = await supabase
        .from('company_settings')
        .select('*')
        .eq('company_id', activeCompany.id)
        .single()

      if (settingsError) {
        console.warn('Failed to load company settings', settingsError)
      }

      setState({
        user,
        session: session ?? null,
        profile: activeProfile,
        company: activeCompany,
        settings: settings ?? null,
        companies,
        loading: false,
      })
    } catch (error) {
      console.error('Failed to load user data', error)
      setState(prev => ({
        ...prev,
        user,
        session: session ?? prev.session,
        profile: null,
        company: null,
        settings: null,
        companies: [],
        loading: false,
      }))
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserData(session.user, session)
      } else {
        setState(prev => ({ ...prev, loading: false }))
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUserData(session.user, session)
      } else {
        setState({
          user: null,
          session: null,
          profile: null,
          company: null,
          settings: null,
          companies: [],
          loading: false,
        })
      }
    })

    return () => subscription.unsubscribe()
  }, [loadUserData])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signInWithGoogle = async (redirectPath = '/') => {
    const callbackUrl = new URL('/auth/callback', window.location.origin)
    if (redirectPath !== '/') callbackUrl.searchParams.set('redirect', redirectPath)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl.toString(),
        scopes: 'email profile',
        queryParams: {
          prompt: 'select_account',
        },
      },
    })
    if (error) throw error
  }

  const signUp = async (email: string, password: string, companyName: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          company_name: companyName,
          display_name: displayName,
        },
      },
    })
    if (error) throw error
  }

  const createCompanyProfile = async (companyName: string, displayName: string) => {
    if (!state.user) throw new Error('You must be signed in to create a company.')

    const { data: companyId, error } = await supabase.rpc('create_company_profile', {
      p_company_name: companyName,
      p_display_name: displayName || state.user.email,
    })

    if (error) throw error

    if (companyId) {
      localStorage.setItem('pos_active_company', companyId)
    }

    await loadUserData(state.user, state.session)
  }

  const signOut = async () => {
    localStorage.removeItem('pos_active_company')
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const switchCompany = async (companyId: string) => {
    if (!state.user) return
    localStorage.setItem('pos_active_company', companyId)
    await loadUserData(state.user)
  }

  return (
    <AuthContext.Provider value={{ ...state, signIn, signInWithGoogle, signUp, createCompanyProfile, signOut, switchCompany }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
