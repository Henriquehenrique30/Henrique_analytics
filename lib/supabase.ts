
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

let supabaseInstance: any = null;

if (supabaseUrl && supabaseAnonKey && supabaseUrl !== '' && supabaseAnonKey !== '') {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  } catch (e) {
    console.error("Erro crítico ao inicializar Supabase:", e);
  }
} else {
  console.error("ERRO DE CONFIGURAÇÃO: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não definidos.");
}

export const supabase = supabaseInstance;
