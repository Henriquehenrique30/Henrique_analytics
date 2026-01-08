// 1. Importação correta (usando a biblioteca instalada)
import { createClient } from '@supabase/supabase-js';

// 2. Jeito certo de pegar variáveis no Vite (import.meta.env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// 3. Criar e exportar o cliente
export const supabase = createClient(supabaseUrl, supabaseAnonKey);