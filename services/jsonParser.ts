
import { FootballEvent, PlayerStats, ParseResult } from '../types';

interface JSONLabel {
  group: string;
  text: string;
}

interface JSONInstance {
  id: string;
  code: string;
  start: string;
  end: string;
  label: JSONLabel[];
}

export const parseFootballJSON = (jsonData: any): ParseResult => {
  const instances: JSONInstance[] = Array.isArray(jsonData) ? jsonData : [];
  
  if (instances.length === 0) {
    return { events: [], stats: {} as PlayerStats };
  }

  const events: FootballEvent[] = [];

  let passesTotal = 0;
  let passesAccurateCount = 0;
  let shotsTotal = 0;
  let shotsOnTarget = 0;
  let duelsTotal = 0;
  let duelsWon = 0;
  let tackles = 0;
  let interceptions = 0;
  let goals = 0;
  let assists = 0;
  let keyPasses = 0;
  let chancesCreated = 0;

  instances.forEach((instance) => {
    // Ignorar eventos administrativos ou de tempo
    const code = (instance.code || "").toLowerCase();
    if (code.includes("start") || code.includes("end") || code.includes("half")) return;

    let x = 50;
    let y = 50;
    let actionName = instance.code;
    let isSuccessful = false;

    // Extrair dados dos labels específicos
    instance.label.forEach(l => {
      if (l.group === "pos_x" && l.text !== "None") x = parseFloat(l.text);
      if (l.group === "pos_y" && l.text !== "None") y = parseFloat(l.text);
      if (l.group === "Action") actionName = l.text;
    });

    const lowerAction = actionName.toLowerCase();
    
    // Determinar sucesso baseado em palavras-chave do scout
    isSuccessful = (
      lowerAction.includes("accurate") || 
      lowerAction.includes("complete") || 
      lowerAction.includes("won") ||
      lowerAction.includes("goal") ||
      lowerAction.includes("successful")
    ) && !lowerAction.includes("inaccurate") && !lowerAction.includes("unsuccessful") && !lowerAction.includes("lost");

    // Normalização de coordenadas (presumindo 0-100 ou 105x68)
    const normX = x > 100 ? (x / 105) * 100 : x;
    const normY = y > 100 ? (y / 68) * 100 : y;

    events.push({
      type: actionName,
      x: normX,
      y: normY,
      success: isSuccessful,
      timestamp: instance.start
    });

    // Mapeamento de Métricas para Estatísticas
    const matches = (keywords: string[]) => keywords.some(k => lowerAction.includes(k));

    if (matches(["pass", "cross", "long ball"])) {
      passesTotal++;
      if (isSuccessful) passesAccurateCount++;
    }
    if (matches(["shot", "goal"])) {
      shotsTotal++;
      if (isSuccessful || lowerAction.includes("target")) shotsOnTarget++;
      if (lowerAction.includes("goal")) goals++;
    }
    if (matches(["duel", "challenge", "dribble"])) {
      duelsTotal++;
      if (isSuccessful) duelsWon++;
    }
    if (lowerAction.includes("assist")) assists++;
    if (lowerAction.includes("key pass") || lowerAction.includes("decisivo")) keyPasses++;
    if (lowerAction.includes("tackle") || lowerAction.includes("desarme")) tackles++;
    if (lowerAction.includes("interception") || lowerAction.includes("recovery")) interceptions++;
    if (lowerAction.includes("chance created")) chancesCreated++;
  });

  const stats: PlayerStats = {
    passes: passesTotal,
    passesAccurate: passesAccurateCount,
    passAccuracy: passesTotal > 0 ? (passesAccurateCount / passesTotal) * 100 : 0,
    shots: shotsTotal,
    shotsOnTarget,
    duels: duelsTotal,
    duelsWon,
    interceptions,
    tackles,
    goals,
    assists,
    keyPasses,
    chances: goals + shotsTotal,
    chancesCreated,
    rating: 6.0 // Inicial
  };

  return { events, stats };
};
