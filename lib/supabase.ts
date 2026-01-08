
import { createClient } from '@supabase/supabase-js';

// Tenta detectar chaves de diferentes prefixos comuns (Vite, Next, ou padrão)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabaseInstance: any = null;

if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')) {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  } catch (e) {
    console.warn("Falha na inicialização do Supabase. O sistema operará em modo local.", e);
  }
} else {
  console.warn("Configurações do Supabase ausentes ou inválidas. O sistema operará em modo local.");
}

export const supabase = supabaseInstance;
