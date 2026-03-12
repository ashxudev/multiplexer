import fs from 'node:fs';
import { parseCsvText, extractCompoundsFromColumns, parseFile } from '../src/renderer/src/lib/csv-parser';

let pass = 0, fail = 0;
function assert(label: string, condition: boolean) {
  if (condition) { console.log(`  PASS: ${label}`); pass++; }
  else { console.log(`  FAIL: ${label}`); fail++; }
}

console.log('=== Test 1: headed CSV with known headers (name, smiles) ===');
const t1 = fs.readFileSync('playwright/fixtures/headed-known.csv', 'utf-8');
const r1 = parseCsvText(t1);
assert('auto-detected (not manual)', r1.needsManualMapping === false);
assert('3 compounds', r1.compounds.length === 3);
assert('first is Aspirin', r1.compounds[0].name === 'Aspirin');
assert('first SMILES correct', r1.compounds[0].smiles === 'CC(=O)Oc1ccccc1C(=O)O');

console.log('\n=== Test 2: headed CSV with unrecognized 3-col headers (real header names preserved) ===');
const t2 = fs.readFileSync('playwright/fixtures/headed-unknown.csv', 'utf-8');
const r2 = parseCsvText(t2);
assert('needs manual mapping', r2.needsManualMapping === true);
assert('real headers preserved', r2.headers?.[0] === 'mol_id');
assert('has canonical_smi header', r2.headers?.[2] === 'canonical_smi');
const extracted2 = extractCompoundsFromColumns(t2, 'canonical_smi', 'mol_id');
assert('extracted 3 compounds with real headers', extracted2.length === 3);
assert('first SMILES correct', extracted2[0].smiles === 'CCO');
assert('first name from mol_id', extracted2[0].name === 'A001');

console.log('\n=== Test 3: headerless 1-col (SMILES only) ===');
const t3 = fs.readFileSync('playwright/fixtures/headerless-1col.csv', 'utf-8');
const r3 = parseCsvText(t3);
assert('not manual', r3.needsManualMapping === false);
assert('4 compounds', r3.compounds.length === 4);
assert('auto-named', r3.compounds[0].name === 'Compound 1');

console.log('\n=== Test 4: headerless 2-col (SMILES + name) ===');
const t4 = fs.readFileSync('playwright/fixtures/headerless-2col.csv', 'utf-8');
const r4 = parseCsvText(t4);
assert('not manual', r4.needsManualMapping === false);
assert('3 compounds', r4.compounds.length === 3);
assert('name from col 2', r4.compounds[0].name === 'ethanol');
assert('SMILES from col 1', r4.compounds[0].smiles === 'CCO');

console.log('\n=== Test 5: headerless 3-col (THE BUG FIX) ===');
const t5 = fs.readFileSync('playwright/fixtures/headerless-3col.csv', 'utf-8');
const r5 = parseCsvText(t5);
assert('3+col manual mapping', r5.needsManualMapping === true);
assert('synthetic headers', r5.headers?.[0] === 'Column 1');
assert('no compounds yet (needs mapping)', r5.compounds.length === 0);
const extracted5 = extractCompoundsFromColumns(t5, 'Column 1', 'Column 2');
assert('extracted 5 compounds', extracted5.length === 5);
assert('first row NOT lost', extracted5[0].smiles === 'CCO');
assert('first name correct', extracted5[0].name === 'ethanol');
assert('last row present', extracted5[4].smiles === 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C');

console.log('\n=== Test 6: .smi tab-separated ===');
const t6 = fs.readFileSync('playwright/fixtures/test-compounds.smi', 'utf-8');
const r6 = parseFile(t6, 'compounds.smi');
assert('parsed tab .smi', r6.compounds.length === 5);
assert('first compound has name', r6.compounds[0].name.length > 0);
assert('not manual mapping', r6.needsManualMapping === false);

console.log('\n=== Test 7: .smi space-separated with multi-word names ===');
const t7 = fs.readFileSync('playwright/fixtures/test-compounds-spaces.smi', 'utf-8');
const r7 = parseFile(t7, 'compounds.smi');
assert('parsed space .smi', r7.compounds.length === 5);
const aceticAcid = r7.compounds.find(c => c.name === 'Acetic acid');
assert('multi-word name "Acetic acid" preserved', aceticAcid !== undefined);

console.log('\n=== Test 8: extractCompoundsFromColumns with REAL headers ===');
const extracted8 = extractCompoundsFromColumns(t1, 'smiles', 'name');
assert('real headers: 3 compounds', extracted8.length === 3);
assert('real headers: first is Aspirin', extracted8[0].name === 'Aspirin');

console.log('\n=== Test 9: headers with special chars NOT misdetected as data ===');
const t9 = 'Batch#,Notes (internal),ID#\nA,some note,001\nB,another note,002\n';
const r9 = parseCsvText(t9);
assert('real headers preserved (not treated as data)', r9.needsManualMapping === true);
assert('header is Batch# not Column 1', r9.headers?.[0] === 'Batch#');
assert('header is Notes (internal)', r9.headers?.[1] === 'Notes (internal)');

console.log('\n=== Test 10: alphanumeric headers NOT misdetected as data ===');
const t10 = 'Plate1b,run3x,2nd\nval1,val2,val3\n';
const r10 = parseCsvText(t10);
assert('real headers preserved', r10.needsManualMapping === true);
assert('header is Plate1b not Column 1', r10.headers?.[0] === 'Plate1b');
assert('header is run3x', r10.headers?.[1] === 'run3x');

console.log(`\n========================================`);
console.log(`Results: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
