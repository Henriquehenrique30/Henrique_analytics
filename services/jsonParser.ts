
import { FootballEvent, PlayerStats, ParseResult } from '../types';

export const parseFootballJSON = (jsonData: any): ParseResult => {
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
    errors: 0,
    dribbles: 0,
    dribblesWon: 0,
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
  let errorsCount = 0;
  let dribblesTotal = 0;
  let dribblesWonCount = 0;

  const determineSuccess = (event: any, actionName: string): boolean => {
    if (typeof event.isFailure === 'boolean' && event.isFailure) return false;
    if (typeof event.isSuccess === 'boolean' && event.isSuccess) return true;
    
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

  const processEventItem = (actionName: string, x: number, y: number, time: string, rawEvent: any) => {
    const isSuccessful = determineSuccess(rawEvent, actionName);
    const lowerAction = actionName.toLowerCase();

    const normX = x > 100 ? (x / 105) * 100 : x;
    const normY = y > 100 ? (y / 68) * 100 : y;

    events.push({
      type: actionName,
      x: normX,
      y: normY,
      success: isSuccessful,
      timestamp: time
    });

    const matches = (keywords: string[]) => keywords.some(k => lowerAction.includes(k));

    // Erros
    if (matches(["mistake", "error", "lost ball", "perda de posse"])) {
      errorsCount++;
    }

    // Dribles
    if (matches(["dribble", "drible", "take on"])) {
      dribblesTotal++;
      if (isSuccessful) dribblesWonCount++;
    }

    // Passes
    const isPass = typeof rawEvent.isPass === 'boolean' ? rawEvent.isPass : matches(["pass", "cross", "long ball"]);
    if (isPass) {
      passesTotal++;
      if (isSuccessful) passesAccurateCount++;
    }

    // Finalizações
    const isShot = typeof rawEvent.isShot === 'boolean' ? rawEvent.isShot : matches(["shot", "goal"]);
    if (isShot || matches(["shot", "goal"])) {
      if (!lowerAction.includes("mistake") || lowerAction.includes("goal")) {
         shotsTotal++;
      }
      if (isSuccessful || lowerAction.includes("target")) shotsOnTarget++;
      if (lowerAction.includes("goal") && isSuccessful && !lowerAction.includes("own goal") && !lowerAction.includes("goal kick")) {
        goals++;
      }
    }

    // Duelos
    if (matches(["duel", "challenge"])) {
      duelsTotal++;
      if (isSuccessful) duelsWon++;
    }

    if (lowerAction.includes("assist")) assists++;
    if (lowerAction.includes("key pass") || lowerAction.includes("decisivo")) keyPasses++;
    if (lowerAction.includes("tackle") || lowerAction.includes("desarme")) tackles++;
    if (lowerAction.includes("interception") || lowerAction.includes("recovery")) interceptions++;
    if (lowerAction.includes("chance created")) chancesCreated++;
  };

  if (Array.isArray(jsonData)) {
    jsonData.forEach((instance: any) => {
      const code = (instance.code || "").toLowerCase();
      if (code.includes("start") || code.includes("end") || code.includes("half")) return;
      let x = 50, y = 50, actionName = instance.code;
      if (instance.label) {
        instance.label.forEach((l: any) => {
          if (l.group === "pos_x" && l.text !== "None") x = parseFloat(l.text);
          if (l.group === "pos_y" && l.text !== "None") y = parseFloat(l.text);
          if (l.group === "Action") actionName = l.text;
        });
      }
      processEventItem(actionName, x, y, instance.start, instance);
    });
  } else if (jsonData && jsonData.events && Array.isArray(jsonData.events)) {
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
      processEventItem(actionName, x, y, time, event);
    });
  }

  return {
    events,
    stats: {
      ...emptyStats,
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
      errors: errorsCount,
      dribbles: dribblesTotal,
      dribblesWon: dribblesWonCount
    }
  };
};
