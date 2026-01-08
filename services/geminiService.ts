import { GoogleGenAI } from "@google/genai";
import { PlayerStats, PlayerInfo } from "../types";

export interface AIAnalysisResult { report: string; rating: number; }

export const generateScoutingReport = async (player: PlayerInfo, stats: PlayerStats): Promise<AIAnalysisResult> => {
  // CORREÇÃO AQUI: No Vite, usamos import.meta.env e o prefixo VITE_
  const apiKey = import.meta.env.VITE_API_KEY;

  if (!apiKey) {
    console.error("ERRO CRÍTICO: API Key não encontrada. Verifique o arquivo .env ou as variáveis da Vercel.");
    throw new Error("MISSING_API_KEY");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    Analise os dados de desempenho do seguinte jogador de futebol e gere um relatório de scout profissional e uma nota (rating) de 4.0 a 10.0.
    
    REGRAS PARA A NOTA:
    - O jogador inicia com nota 6.0 (base).
    - Melhore a nota por gols, assistências, chances criadas, passes decisivos, alta precisão de passe e duelos vencidos.
    - Diminua a nota por erros críticos, baixa participação ou baixa eficiência em chances claras.
    - A nota pode ter uma casa decimal (ex: 7.1, 8.5, 9.8, 6.0).
    - IMPORTANTE: Comece sua resposta EXATAMENTE com o formato "RATING: X.X" onde X.X é a nota decidida.
    
    DADOS DO JOGADOR:
    Nome: ${player.name}
    Posição: ${player.position}
    se for um zagueiro ou jogador de defesa julgar como tal
    
    Métricas do Jogo:
    - Gols: ${stats.goals}
    - Assistências: ${stats.assists}
    - Chances Criadas: ${stats.chancesCreated}
    - Chances (Oportunidades): ${stats.chances}
    - Passes Decisivos: ${stats.keyPasses}
    - Passes Totais: ${stats.passes} (Precisão: ${stats.passAccuracy.toFixed(1)}%)
    - Finalizações: ${stats.shots} (No Alvo: ${stats.shotsOnTarget})
    - Duelos: ${stats.duels} (Vencidos: ${stats.duelsWon})
    - Interceptações: ${stats.interceptions}
    - Desarmes: ${stats.tackles}
    
    ESTRUTURA DO RELATÓRIO (após a linha do Rating):
    1. Resumo Geral de Desempenho
    2. Contribuição Tática
    3. Pontos Fortes
    4. Sugestões de Melhoria
    
    Use um tom profissional e conciso. Responda em Português.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp', // Recomendo usar este modelo ou 'gemini-1.5-flash' se o pro-preview falhar
      contents: prompt,
    });
    
    const text = response.text || "";
    let rating = 5.0;
    
    const ratingMatch = text.match(/RATING:\s*(\d+\.?\d*)/i);
    if (ratingMatch && ratingMatch[1]) {
      rating = parseFloat(ratingMatch[1]);
    }
    
    const report = text.replace(/RATING:\s*(\d+\.?\d*)\s*/i, "").trim();

    return {
      report: report || "Não foi possível gerar a análise detalhada.",
      rating: rating
    };
  } catch (error: any) {
    console.error("AI Error:", error);
    throw error;
  }
};