// Test to see if Object.keys preserves numeric key order

const testObj = {
  "count": "21",
  "0": "Week 1",
  "1": "Week 2",
  "2": "Week 3",
  "3": "Week 4",
  "4": "Week 5",
  "5": "Week 6",
  "9": "Week 10",
  "20": "Week 21"
};

const keys = Object.keys(testObj).filter(k => k !== 'count');

console.log('Keys in order:', keys);
console.log('Last key:', keys[keys.length - 1]);
console.log('Value at last key:', testObj[keys[keys.length - 1]]);
