
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega as variáveis de ambiente baseadas no modo (development/production)
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Injeta process.env para que o código do navegador possa acessá-lo como se fosse Node.js
      // Isso é necessário para a SDK @google/genai e para ler as chaves do Supabase
      'process.env': env
    },
  };
});
