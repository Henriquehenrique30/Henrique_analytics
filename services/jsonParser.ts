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
  // Inicializa um objeto zerado para evitar o erro 'undefined' (toFixed)
  const emptyStats: PlayerStats = {
    passes: 0,
    passesAccurate: 0,
    passAccuracy: 0,
    shots: 0,
    shotsOnTarget: 0,
    duels: 0,
    duelsWon: 0,
    interceptions: 0,
    tackles: 0,
    goals: 0,
    assists: 0,
    keyPasses: 0,
    chances: 0,
    chancesCreated: 0,
    rating: 6.0
  };

  const events: FootballEvent[] = [];

  // Contadores
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

  // Função auxiliar para processar cada ação, independentemente do formato do JSON
  const processAction = (actionName: string, x: number, y: number, time: string) => {
    const lowerAction = actionName.toLowerCase();
    
    // Lógica de sucesso baseada nas palavras-chave do scout
    const isSuccessful = (
      lowerAction.includes("accurate") || 
      lowerAction.includes("complete") || 
      lowerAction.includes("won") ||
      lowerAction.includes("goal") ||
      lowerAction.includes("successful")
    ) && !lowerAction.includes("inaccurate") && !lowerAction.includes("unsuccessful") && !lowerAction.includes("lost");

    // Normalização de coordenadas
    const normX = x > 100 ? (x / 105) * 100 : x;
    const normY = y > 100 ? (y / 68) * 100 : y;

    events.push({
      type: actionName,
      x: normX,
      y: normY,
      success: isSuccessful,
      timestamp: time
    });

    // Mapeamento de estatísticas
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
  };

  // DETECTAR FORMATO 1: Array de instâncias (Formato Original/Wyscout Raw)
  if (Array.isArray(jsonData)) {
    jsonData.forEach((instance: JSONInstance) => {
      const code = (instance.code || "").toLowerCase();
      if (code.includes("start") || code.includes("end") || code.includes("half")) return;

      let x = 50, y = 50;
      let actionName = instance.code;

      instance.label.forEach(l => {
        if (l.group === "pos_x" && l.text !== "None") x = parseFloat(l.text);
        if (l.group === "pos_y" && l.text !== "None") y = parseFloat(l.text);
        if (l.group === "Action") actionName = l.text;
      });

      processAction(actionName, x, y, instance.start);
    });
  } 
  // DETECTAR FORMATO 2: Objeto com array 'events' (Formato do ficheiro enviado)
  else if (jsonData && jsonData.events && Array.isArray(jsonData.events)) {
    jsonData.events.forEach((event: any) => {
      const actionName = event.type || "";
      let x = 50, y = 50;

      // Extrair coordenadas das tags (índices 3 e 4 no formato padrão deste JSON)
      if (event.tags && Array.isArray(event.tags) && event.tags.length >= 5) {
        const parsedX = parseFloat(event.tags[3]);
        const parsedY = parseFloat(event.tags[4]);
        if (!isNaN(parsedX)) x = parsedX;
        if (!isNaN(parsedY)) y = parsedY;
      }

      const time = event.start ? event.start.toString() : "0";
      processAction(actionName, x, y, time);
    });
  } else {
    // Se o formato não for reconhecido, retorna stats zerados (evita o crash)
    return { events: [], stats: emptyStats };
  }

  // Montar objeto final de estatísticas
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
    rating: 6.0 
  };

  return { events, stats };
};