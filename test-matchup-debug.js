// Test script to debug matchup selection logic

// Simulated matchups data based on Claude Desktop's findings
const mockMatchups = {
  "count": "21",
  "0": { matchup: [{ week: 1, status: "postevent", teams: { "0": { team: [[{}, {}, { name: "WoodysColts's Team" }]] } } }] },
  "1": { matchup: [{ week: 2, status: "postevent", teams: {} }] },
  "2": { matchup: [{ week: 3, status: "postevent", teams: {} }] },
  "3": { matchup: [{ week: 4, status: "postevent", teams: {} }] },
  "4": { matchup: [{ week: 5, status: "midevent", teams: { "0": { team: [[{}, {}, { name: "Your Team" }]] }, "1": { team: [[{}, {}, { name: "Zaid's Team" }]] } } }] },
  "5": { matchup: [{ week: 6, status: "preevent", teams: {} }] },
  "9": { matchup: [{ week: 10, status: "preevent", teams: { "0": { team: [[{}, {}, { name: "Your Team" }]] }, "1": { team: [[{}, {}, { name: "The Mighty Avengers" }]] } } }] },
  "20": { matchup: [{ week: 21, status: "preevent", teams: {} }] }
};

// Current implementation
function findCurrentMatchup(matchups) {
  if (!matchups || matchups.count === '0') {
    return null;
  }

  // Find matchup with status === "midevent" (current week)
  const matchupKeys = Object.keys(matchups).filter(key => key !== 'count');

  console.log('All matchup keys:', matchupKeys);

  const currentMatchup = matchupKeys.find(key => {
    const matchup = matchups[key]?.matchup?.[0] || matchups[key]?.matchup;
    console.log(`Checking key ${key}:`, {
      week: matchup?.week,
      status: matchup?.status,
      hasMatchup: !!matchup
    });
    return matchup?.status === 'midevent';
  });

  console.log('Found currentMatchup key:', currentMatchup);

  // If found, return it; otherwise fallback to last matchup
  if (currentMatchup) {
    console.log('Returning matchup for key:', currentMatchup);
    return matchups[currentMatchup].matchup;
  }

  // Fallback: return the last matchup in the list
  const lastKey = matchupKeys[matchupKeys.length - 1];
  console.log('Falling back to last key:', lastKey);
  return lastKey ? matchups[lastKey].matchup : null;
}

// Test it
console.log('\n=== TESTING MATCHUP FINDER ===\n');
const result = findCurrentMatchup(mockMatchups);

if (result) {
  const matchupData = result[0];
  console.log('\n=== FINAL RESULT ===');
  console.log('Week:', matchupData.week);
  console.log('Status:', matchupData.status);
  console.log('Opponent:', matchupData.teams?.['1']?.team?.[0]?.[2]?.name || 'Unknown');
}
