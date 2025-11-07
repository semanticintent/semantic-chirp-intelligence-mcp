// Let me trace through EXACTLY what findCurrentMatchup returns

const mockMatchups = {
  "count": "21",
  "4": {
    matchup: [
      {
        week: 5,
        status: "midevent",
        teams: {
          "0": { team: [[{}, {}, { name: "Your Team" }]] },
          "1": { team: [[{}, {}, { name: "Zaid's Team" }]] }
        }
      }
    ]
  },
  "9": {
    matchup: [
      {
        week: 10,
        status: "preevent",
        teams: {
          "0": { team: [[{}, {}, { name: "Your Team" }]] },
          "1": { team: [[{}, {}, { name: "The Mighty Avengers" }]] }
        }
      }
    ]
  },
  "20": {
    matchup: [
      {
        week: 21,
        status: "preevent",
        teams: {}
      }
    ]
  }
};

function findCurrentMatchup(matchups) {
  if (!matchups || matchups.count === '0') {
    return null;
  }

  const matchupKeys = Object.keys(matchups).filter(key => key !== 'count');

  console.log('Step 1 - All keys:', matchupKeys);

  const currentMatchup = matchupKeys.find(key => {
    const matchup = matchups[key]?.matchup?.[0] || matchups[key]?.matchup;
    console.log(`  Checking key "${key}":`, {
      week: matchup?.week,
      status: matchup?.status
    });
    return matchup?.status === 'midevent';
  });

  console.log('Step 2 - Found key with midevent:', currentMatchup);

  if (currentMatchup) {
    console.log('Step 3 - Returning matchups[' + currentMatchup + '].matchup');
    const result = matchups[currentMatchup].matchup;
    console.log('Step 4 - Result structure:', {
      isArray: Array.isArray(result),
      length: result?.length,
      firstElement: result?.[0]
    });
    return result;
  }

  const lastKey = matchupKeys[matchupKeys.length - 1];
  console.log('Step 3 (fallback) - Returning last key:', lastKey);
  return lastKey ? matchups[lastKey].matchup : null;
}

console.log('\n=== RUNNING TEST ===\n');
const result = findCurrentMatchup(mockMatchups);

console.log('\n=== PROCESSING RESULT ===\n');
if (result) {
  console.log('result type:', Array.isArray(result) ? 'Array' : 'Object');
  console.log('result[0]:', result[0]);

  const matchupData = result[0];
  const teams = matchupData.teams;

  console.log('\n=== FINAL OUTPUT ===');
  console.log('Week:', matchupData.week);
  console.log('Status:', matchupData.status);
  console.log('Your team:', teams['0'].team[0][2].name);
  console.log('Opponent:', teams['1'].team[0][2].name);
}
