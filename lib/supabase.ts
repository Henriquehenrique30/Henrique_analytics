
import { createClient } from '@supabase/supabase-js';

// No Vite, com a configuração de 'define' no vite.config.ts, 
// process.env estará disponível no navegador.
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

let supabaseInstance: any = null;

if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')) {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    console.log("Supabase inicializado com sucesso.");
  } catch (e) {
    console.warn("Falha na inicialização do Supabase:", e);
  }
} else {
  console.warn("Configurações do Supabase ausentes. O sistema operará em modo local até que as chaves sejam configuradas.");
}

export const supabase = supabaseInstance;
