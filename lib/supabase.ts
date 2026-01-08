// Agora importamos do pacote instalado, não da URL
import { createClient } from '@supabase/supabase-js';

// No Vite (que estamos configurando), usa-se import.meta.env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);