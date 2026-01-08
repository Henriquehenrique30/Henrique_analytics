
import { GoogleGenAI } from "@google/genai";
import { PlayerStats, PlayerInfo } from "../types";

export interface AIAnalysisResult {
  report: string;
  rating: number;
}

export const generateScoutingReport = async (player: PlayerInfo, stats: PlayerStats): Promise<AIAnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Analise os dados de desempenho do seguinte jogador de futebol e gere um relatório de scout profissional e uma nota (rating) de 4.0 a 10.0.
    
    REGRAS PARA A NOTA:
    - O jogador inicia com nota 6.0 (base).
    - Melhore a nota por gols, assistências, chances criadas, passes decisivos, alta precisão de passe e duelos vencidos.
    - Diminua a nota por erros críticos, baixa participação ou baixa eficiência em chances claras.
    - A nota deve ter uma casa decimal (ex: 7.1, 8.5, 9.8, 6.0).
    - IMPORTANTE: Comece sua resposta EXATAMENTE com o formato "RATING: X.X" onde X.X é a nota decidida.
    
    DADOS DO JOGADOR:
    Nome: ${player.name}
    Posição: ${player.position}
    
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
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    
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
  } catch (error) {
    console.error("AI Error:", error);
    return {
      report: "Erro ao processar análise inteligente.",
      rating: 6.0
    };
  }
};
