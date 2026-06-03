// Tokenize the sample .pg file through the same TextMate engine VS Code uses,
// so we can verify the grammar produces sensible scopes before shipping.
const fs = require('fs');
const path = require('path');
const oniguruma = require('vscode-oniguruma');
const textmate = require('vscode-textmate');

async function main() {
  const wasmPath = require.resolve('vscode-oniguruma/release/onig.wasm');
  const wasmBin = fs.readFileSync(wasmPath).buffer;
  await oniguruma.loadWASM(wasmBin);

  const registry = new textmate.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (sources) => new oniguruma.OnigScanner(sources),
      createOnigString: (s) => new oniguruma.OnigString(s),
    }),
    loadGrammar: async (scopeName) => {
      if (scopeName === 'source.pg') {
        const grammarPath = path.join(__dirname, '..', 'syntaxes', 'pg.tmLanguage.json');
        const raw = fs.readFileSync(grammarPath, 'utf8');
        return textmate.parseRawGrammar(raw, grammarPath);
      }
      return null;
    },
  });

  const grammar = await registry.loadGrammar('source.pg');
  if (!grammar) {
    console.error('Grammar failed to load.');
    process.exit(1);
  }

  const sample = fs.readFileSync(path.join(__dirname, 'sample.pg'), 'utf8');
  const lines = sample.split('\n');

  let ruleStack = textmate.INITIAL;
  let scopeCount = {};
  let unknownLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const result = grammar.tokenizeLine(line, ruleStack);
    ruleStack = result.ruleStack;

    // Print first non-trivial line to stdout to spot-check
    if (i < 50) {
      console.log(`L${String(i + 1).padStart(3)}: ${JSON.stringify(line)}`);
      for (const tok of result.tokens) {
        const text = line.slice(tok.startIndex, tok.endIndex);
        const scopes = tok.scopes.filter(s => s !== 'source.pg').join(' ');
        if (text.trim().length === 0) continue;
        console.log(`        ${JSON.stringify(text).padEnd(30)} ${scopes}`);
        for (const s of tok.scopes) {
          scopeCount[s] = (scopeCount[s] || 0) + 1;
        }
      }
    } else {
      for (const tok of result.tokens) {
        for (const s of tok.scopes) {
          scopeCount[s] = (scopeCount[s] || 0) + 1;
        }
      }
    }
  }

  console.log('\n=== Scope frequency ===');
  const sorted = Object.entries(scopeCount).sort((a, b) => b[1] - a[1]);
  for (const [scope, n] of sorted) {
    console.log(`  ${String(n).padStart(4)}  ${scope}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
