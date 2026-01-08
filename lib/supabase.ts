
import { createClient } from '@supabase/supabase-js';

// Função auxiliar para evitar erros de 'undefined' no process.env
const getEnv = (key: string): string => {
  try {
    return process.env[key] || '';
  } catch (e) {
    return '';
  }
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Atenção: Credenciais do Supabase não encontradas. Verifique suas variáveis de ambiente.");
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);
