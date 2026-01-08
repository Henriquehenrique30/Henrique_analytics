
import { createClient } from '@supabase/supabase-js';

// No ambiente de execução, as variáveis são injetadas no process.env
const supabaseUrl = (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL : '') || '';
const supabaseAnonKey = (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_ANON_KEY : '') || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials missing. Check your environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
