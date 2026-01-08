
import { createClient } from '@supabase/supabase-js';

// No ambiente de execução, process.env é a fonte primária de chaves
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("ERRO DE CONFIGURAÇÃO: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não definidos em process.env.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
