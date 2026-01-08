
import { FootballEvent, PlayerStats, ParseResult } from '../types';

export const parseFootballXML = (xmlString: string): ParseResult => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  
  const rawInstances = xmlDoc.getElementsByTagName("instance");
  let detectedPlayerName = "";

  // Temporal grouping map: timestamp -> list of actions/codes occurring at that time
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

      if (group === "pos_x" && text !== "None") {
        x = parseFloat(text || "0");
        hasCoords = true;
      }
      if (group === "pos_y" && text !== "None") {
        y = parseFloat(text || "0");
        hasCoords = true;
      }
      if (group === "Action") {
        action = text || "";
      }
    });

    if (!action) action = code;
    const lowerAction = action.toLowerCase();
    
    // Strict success detection logic to avoid "inaccurate" matching "accurate"
    const isAccurate = lowerAction.includes("accurate") && !lowerAction.includes("inaccurate");
    const isSuccessful = lowerAction.includes("successful") && !lowerAction.includes("unsuccessful");
    const isWon = lowerAction.includes("won") && !lowerAction.includes("lost");
    
    const success = (
      isAccurate || 
      isSuccessful || 
      isWon || 
      lowerAction.includes("goals") ||
      lowerAction.includes("recovery")
    );

    // Filter out generic match/half markers
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
    const normX = (x / 105) * 100;
    const normY = (y / 68) * 100;

    const primaryAction = actions[0];
    events.push({ 
      type: primaryAction, 
      x: normX, 
      y: normY, 
      success, 
      timestamp 
    });

    // Helper to check for tags while respecting negations
    const hasTag = (positives: string[], negatives: string[] = []) => {
      const foundPositive = actions.some(a => positives.some(p => a.includes(p)));
      if (!foundPositive) return false;
      const foundNegative = actions.some(a => negatives.some(n => a.includes(n)));
      return !foundNegative;
    };

    // DUELS
    if (hasTag(["challenges won", "tackles successful", "air challenges won", "dribbles successful"])) {
      duelsTotal++;
      duelsWon++;
    } else if (hasTag(["challenges", "duel", "tackle", "dribble"], ["half", "match"])) {
      duelsTotal++;
    }

    // PASSES
    if (hasTag(["pass", "cross", "long ball"])) {
      passesTotal++;
      // Check if this specific pass event was accurate
      const isPassAccurate = actions.some(a => (a.includes("accurate") || a.includes("successful")) && !a.includes("inaccurate") && !a.includes("unsuccessful"));
      if (isPassAccurate || (success && !actions.some(a => a.includes("inaccurate") || a.includes("unsuccessful")))) {
        passesAccurateCount++;
      }
    }

    // SHOTS / GOALS
    if (hasTag(["shot", "goals"])) {
      shotsTotal++;
      if (hasTag(["target", "goals"], ["off target"])) {
        shotsOnTarget++;
      }
      if (hasTag(["goal"], ["own", "contra"])) {
        goals++;
      }
    }

    // OTHER METRICS
    if (hasTag(["assist"])) assists++;
    if (hasTag(["key pass", "shot assist", "passe decisivo"])) keyPasses++;
    if (hasTag(["tackle"])) tackles++;
    if (hasTag(["recovery", "interception"])) interceptions++;
    
    // CHANCES
    if (hasTag(["big chance", "chance clara", "high value"])) chances++;
    if (hasTag(["chance created", "chance criada", "key pass"])) chancesCreated++;
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
