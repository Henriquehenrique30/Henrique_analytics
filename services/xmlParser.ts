
import { FootballEvent, PlayerStats, ParseResult } from '../types';

export const parseFootballXML = (xmlString: string): ParseResult => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  
  if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
    console.error("XML Parsing Error");
    return { events: [], stats: {} as PlayerStats };
  }

  const rawInstances = xmlDoc.getElementsByTagName("instance");
  let detectedPlayerName = "";
  const temporalGroups: Map<string, { actions: string[], success: boolean, x: number, y: number }> = new Map();

  Array.from(rawInstances).forEach((instance) => {
    const code = instance.getElementsByTagName("code")[0]?.textContent || "";
    const start = instance.getElementsByTagName("start")[0]?.textContent || "0";
    const labels = Array.from(instance.getElementsByTagName("label"));
    
    let x = 0;
    let y = 0;
    let action = "";
    let hasCoords = false;

    if (!detectedPlayerName && code.includes(" - ")) {
      detectedPlayerName = code.split(" - ")[0].trim();
    }

    labels.forEach(label => {
      const group = label.getElementsByTagName("group")[0]?.textContent;
      const text = label.getElementsByTagName("text")[0]?.textContent;

      if (group === "pos_x" && text && text !== "None") {
        x = parseFloat(text);
        hasCoords = true;
      }
      if (group === "pos_y" && text && text !== "None") {
        y = parseFloat(text);
        hasCoords = true;
      }
      if (group === "Action") {
        action = text || "";
      }
    });

    if (!action) action = code;
    const lowerAction = action.toLowerCase();
    
    const isAccurate = lowerAction.includes("accurate") && !lowerAction.includes("inaccurate");
    const isSuccessful = (lowerAction.includes("successful") || lowerAction.includes("sucesso")) && !lowerAction.includes("unsuccessful");
    const isWon = lowerAction.includes("won") || lowerAction.includes("ganho");
    
    const success = (
      isAccurate || 
      isSuccessful || 
      isWon || 
      lowerAction.includes("goal") ||
      lowerAction.includes("recovery") ||
      lowerAction.includes("complete")
    );

    if (lowerAction.includes("half") || lowerAction.includes("match")) return;

    const existing = temporalGroups.get(start);
    if (existing) {
      existing.actions.push(lowerAction);
      if (success) existing.success = true; 
      if (!existing.x && hasCoords) {
        existing.x = x;
        existing.y = y;
      }
    } else {
      temporalGroups.set(start, { actions: [lowerAction], success, x, y });
    }
  });

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
  let chances = 0;
  let chancesCreated = 0;

  temporalGroups.forEach((data, timestamp) => {
    const { actions, success, x, y } = data;
    // Normalização padrão para campo de 105x68
    const normX = x ? (x / 105) * 100 : 50;
    const normY = y ? (y / 68) * 100 : 50;

    events.push({ 
      type: actions[0], 
      x: normX, 
      y: normY, 
      success, 
      timestamp 
    });

    const hasTag = (pos: string[]) => actions.some(a => pos.some(p => a.includes(p)));

    if (hasTag(["pass", "cross", "long ball"])) {
      passesTotal++;
      if (success) passesAccurateCount++;
    }

    if (hasTag(["shot", "goal"])) {
      shotsTotal++;
      if (success || hasTag(["target"])) shotsOnTarget++;
      if (hasTag(["goal"])) goals++;
    }

    if (hasTag(["duel", "challenge", "dribble"])) {
      duelsTotal++;
      if (success) duelsWon++;
    }

    if (hasTag(["assist"])) assists++;
    if (hasTag(["key pass", "decisivo"])) keyPasses++;
    if (hasTag(["tackle", "desarme"])) tackles++;
    if (hasTag(["interception", "recovery"])) interceptions++;
    if (hasTag(["big chance"])) chances++;
    if (hasTag(["chance created"])) chancesCreated++;
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
    chances,
    chancesCreated,
    rating: 6.0
  };

  return { events, stats, detectedPlayerName };
};
