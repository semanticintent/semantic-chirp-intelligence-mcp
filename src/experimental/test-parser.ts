/**
 * Test script for semantic intent parser
 * Run this to validate the POC works
 */

import { SemanticIntentParser, validateParser, TEST_SEMANTIC_TOOLS } from './semantic-intent-parser.js';

console.log('='.repeat(80));
console.log('SEMANTIC INTENT PARSER - PROOF OF CONCEPT TEST');
console.log('='.repeat(80));
console.log();

// Test individual tool parsing
console.log('📝 Testing individual tool parsing:\n');

const parser = new SemanticIntentParser();

for (const [key, tool] of Object.entries(TEST_SEMANTIC_TOOLS)) {
  console.log(`\n🔧 Tool: ${tool.name}`);
  console.log('─'.repeat(80));
  console.log('Intent:');
  console.log(tool.semanticIntent.trim());
  console.log();

  const parsed = parser.parseIntent(tool.semanticIntent);

  console.log('Parsed Configuration:');
  console.log('  Parameters:', JSON.stringify(parsed.parameters, null, 4));
  console.log('  Capabilities:', parsed.capabilities);
  console.log('  Confidence:', `${(parsed.confidence * 100).toFixed(0)}%`);
}

console.log('\n' + '='.repeat(80));
console.log('🧪 VALIDATION TEST RESULTS');
console.log('='.repeat(80));
console.log();

// Run comprehensive validation
const validation = validateParser();

for (const result of validation.results) {
  const icon = result.match ? '✅' : '❌';
  console.log(`${icon} ${result.tool}: ${result.match ? 'PASS' : 'FAIL'}`);

  if (!result.match) {
    console.log('   Expected:', JSON.stringify(result.expected, null, 2));
    console.log('   Got:', JSON.stringify(result.parsed, null, 2));
  }
}

console.log();
console.log('─'.repeat(80));
console.log(`Overall Result: ${validation.success ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
console.log('─'.repeat(80));

console.log('\n📊 ANALYSIS:\n');

if (validation.success) {
  console.log('✅ The semantic intent parser successfully extracted:');
  console.log('   • Parameter names, types, and required/optional flags');
  console.log('   • Capability requirements from action descriptions');
  console.log('   • Confidence scores based on parse completeness');
  console.log();
  console.log('🎯 RECOMMENDATION: The foundation is solid!');
  console.log('   The basic premise works - semantic intent can reliably generate tool configuration.');
  console.log('   You can proceed with confidence to build the full universal architecture.');
} else {
  console.log('⚠️  The parser had issues extracting configuration correctly.');
  console.log('   Review the failed tests above to understand parsing limitations.');
  console.log('   The regex patterns may need refinement, or the concept needs rethinking.');
}

console.log('\n' + '='.repeat(80));

// Exit with appropriate code
process.exit(validation.success ? 0 : 1);
