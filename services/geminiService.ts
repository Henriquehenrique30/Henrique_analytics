
import { GoogleGenAI } from "@google/genai";
import { PlayerStats, PlayerInfo } from "../types";

export interface AIAnalysisResult { report: string; rating: number; }

export const generateScoutingReport = async (player: PlayerInfo, stats: PlayerStats): Promise<AIAnalysisResult> => {
  // Inicialização obrigatória conforme diretrizes
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Analise os dados de desempenho do seguinte jogador de futebol e gere um relatório de scout profissional e uma nota (rating) de 4.0 a 10.0.
    
    DADOS DO JOGADOR:
    Nome: ${player.name}
    Posição: ${player.position}
    
    Métricas do Jogo:
    - Gols: ${stats.goals} | Assistências: ${stats.assists}
    - Chances Criadas: ${stats.chancesCreated}
    - Passes: ${stats.passes} (Precisão: ${stats.passAccuracy.toFixed(1)}%)
    - Passes Decisivos: ${stats.keyPasses}
    - Duelos: ${stats.duels} (Vencidos: ${stats.duelsWon})
    - Interceptações: ${stats.interceptions} | Desarmes: ${stats.tackles}
    
    REQUISITOS:
    - Comece com "RATING: X.X"
    - Relatório em Português: Resumo, Impacto Tático, Pontos Fortes e Melhorias.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
    });
    
    // Acesso direto à propriedade .text (não é um método)
    const text = response.text || "";
    let rating = 6.0;
    
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
