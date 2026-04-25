import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    storage: localStorage,
  },
})

/**
 * 🔥 Helper para errores bonitos
 */
const errorMessageMap: Array<[RegExp, string]> = [
  [/Invalid login credentials/i, 'Correo o contraseña inválidos.'],
  [/Email not confirmed/i, 'Debes confirmar tu correo.'],
  [/User already registered/i, 'Este correo ya existe.'],
  [/Password should be at least/i, 'Contraseña muy corta.'],
  [/JWT expired/i, 'Sesión expirada.'],
  [/network/i, 'Error de conexión.'],
]

export function getSupabaseErrorMessage(
  error: unknown,
  fallback = 'Error inesperado.'
) {
  const rawMessage =
    typeof error === 'string'
      ? error
      : error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : fallback

  const mapped = errorMessageMap.find(([pattern]) =>
    pattern.test(rawMessage)
  )

  return mapped?.[1] ?? rawMessage ?? fallback
}