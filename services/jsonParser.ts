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
  // Inicializa estatísticas zeradas
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

  // Função auxiliar para determinar sucesso usando as flags do seu arquivo (isSuccess/isFailure)
  const determineSuccess = (event: any, actionName: string): boolean => {
    // 1. Prioridade absoluta: O que o arquivo diz explicitamente
    if (typeof event.isFailure === 'boolean' && event.isFailure) return false;
    if (typeof event.isSuccess === 'boolean' && event.isSuccess) return true;
    
    // 2. Fallback: Análise de texto (apenas se o arquivo não tiver as flags)
    const lower = actionName.toLowerCase();
    const isFailureText = lower.includes("inaccurate") || 
                          lower.includes("unsuccessful") || 
                          lower.includes("lost") || 
                          lower.includes("mistake") || 
                          lower.includes("miss") ||
                          lower.includes("error");
    
    if (isFailureText) return false;

    return lower.includes("accurate") || 
           lower.includes("complete") || 
           lower.includes("won") || 
           lower.includes("goal") || 
           lower.includes("successful");
  };

  // Processa cada evento individualmente
  const processEventItem = (actionName: string, x: number, y: number, time: string, rawEvent: any) => {
    const isSuccessful = determineSuccess(rawEvent, actionName);
    const lowerAction = actionName.toLowerCase();

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

    // --- Mapeamento de Estatísticas ---
    const matches = (keywords: string[]) => keywords.some(k => lowerAction.includes(k));

    // Passes
    // Usa a flag isPass do arquivo se existir
    const isPass = typeof rawEvent.isPass === 'boolean' ? rawEvent.isPass : matches(["pass", "cross", "long ball"]);
    if (isPass) {
      passesTotal++;
      if (isSuccessful) passesAccurateCount++;
    }

    // Finalizações e Gols
    // Usa a flag isShot do arquivo se existir
    const isShot = typeof rawEvent.isShot === 'boolean' ? rawEvent.isShot : matches(["shot", "goal"]);
    
    if (isShot || matches(["shot", "goal"])) {
      // Se for "Goal mistakes" (falha), não conta como chute a gol, apenas erro
      if (!lowerAction.includes("mistake") || lowerAction.includes("goal")) {
         shotsTotal++;
      }
      
      if (isSuccessful || lowerAction.includes("target")) shotsOnTarget++;

      // CORREÇÃO DEFINITIVA DO GOL:
      // Só conta gol se: 
      // 1. Tem "goal" no nome 
      // 2. O arquivo diz que foi SUCESSO (isSuccess=true / isFailure=false)
      // 3. Não é gol contra ou tiro de meta
      if (lowerAction.includes("goal") && 
          isSuccessful && 
          !lowerAction.includes("own goal") && 
          !lowerAction.includes("goal kick")) {
        goals++;
      }
    }

    // Duelos
    if (matches(["duel", "challenge", "dribble"])) {
      duelsTotal++;
      if (isSuccessful) duelsWon++;
    }

    // Outras métricas
    if (lowerAction.includes("assist")) assists++;
    if (lowerAction.includes("key pass") || lowerAction.includes("decisivo")) keyPasses++;
    if (lowerAction.includes("tackle") || lowerAction.includes("desarme")) tackles++;
    if (lowerAction.includes("interception") || lowerAction.includes("recovery")) interceptions++;
    if (lowerAction.includes("chance created")) chancesCreated++;
  };

  // --- Detecção de Formato ---

  // CASO 1: Formato Wyscout Raw (Array direto)
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

      processEventItem(actionName, x, y, instance.start, instance);
    });
  } 
  // CASO 2: Seu Formato JSON (Objeto com array 'events')
  else if (jsonData && jsonData.events && Array.isArray(jsonData.events)) {
    jsonData.events.forEach((event: any) => {
      const actionName = event.type || "";
      let x = 50, y = 50;

      if (event.tags && Array.isArray(event.tags) && event.tags.length >= 5) {
        const parsedX = parseFloat(event.tags[3]);
        const parsedY = parseFloat(event.tags[4]);
        if (!isNaN(parsedX)) x = parsedX;
        if (!isNaN(parsedY)) y = parsedY;
      }

      const time = event.start ? event.start.toString() : "0";
      // Passamos o objeto 'event' completo para verificar as flags isFailure/isSuccess
      processEventItem(actionName, x, y, time, event);
    });
  } else {
    return { events: [], stats: emptyStats };
  }

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