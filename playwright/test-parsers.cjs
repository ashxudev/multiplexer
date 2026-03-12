const fs = require('fs');
const Papa = require('papaparse');

const SMILES_HEADERS = new Set(['smiles','canonical_smiles','smiles_string','smi','molecule','compound_smiles','ligand_smiles','structure']);
const NAME_HEADERS = new Set(['name','compound_name','compound','id','compound_id','mol_name','title','label','molecule_name']);

function parseCsvText(text) {
  const headerResult = Papa.parse(text, { header: true, skipEmptyLines: true });
  const fields = headerResult.meta.fields || [];

  if (fields.length > 0) {
    const smilesCol = fields.find(f => SMILES_HEADERS.has(f.trim().toLowerCase()));
    const nameCol = fields.find(f => NAME_HEADERS.has(f.trim().toLowerCase()));

    if (smilesCol) {
      const compounds = headerResult.data.map((row, i) => ({
        name: nameCol ? (row[nameCol]?.trim() || `Compound ${i+1}`) : `Compound ${i+1}`,
        smiles: row[smilesCol]?.trim() || '',
      })).filter(c => c.smiles !== '');
      return { compounds, headers: fields, needsManualMapping: false, note: 'auto-detected' };
    }

    // Check if first row looks like data (SMILES-like patterns)
    const SMILES_PATTERN = /[A-Za-z]\(|[A-Za-z]\[|\][A-Za-z]|\d[a-z]|[a-z]\d|=[A-Z]/;
    const looksLikeData = fields.some(f => SMILES_PATTERN.test(f) || /^\d+(\.\d+)?$/.test(f.trim()));
    if (fields.length <= 2 || looksLikeData) {
      return parseHeaderless(text);
    }

    // 3+ columns with text-like headers — keep real names for manual mapper
    return { compounds: [], headers: fields, needsManualMapping: true, note: 'real-headers-manual' };
  }
  return parseHeaderless(text);
}

function parseHeaderless(text) {
  const result = Papa.parse(text, { header: false, skipEmptyLines: true });
  const rows = result.data;
  if (rows.length === 0) return { compounds: [], headers: null, needsManualMapping: false };

  const colCount = rows[0].length;
  if (colCount === 1) {
    return { compounds: rows.map((r,i) => ({ name: `Compound ${i+1}`, smiles: r[0].trim() })).filter(c=>c.smiles), headers: null, needsManualMapping: false, note: '1-col auto' };
  }
  if (colCount === 2) {
    return { compounds: rows.map((r,i) => ({ name: r[1]?.trim() || `Compound ${i+1}`, smiles: r[0].trim() })).filter(c=>c.smiles), headers: null, needsManualMapping: false, note: '2-col auto' };
  }
  const headers = rows[0].map((_,i) => `Column ${i+1}`);
  return { compounds: [], headers, needsManualMapping: true, note: '3+col manual', rowCount: rows.length };
}

function extractCompoundsFromColumns(text, smilesCol, nameCol) {
  const smilesIdxMatch = smilesCol.match(/^Column (\d+)$/);
  if (smilesIdxMatch) {
    const smilesIdx = parseInt(smilesIdxMatch[1], 10) - 1;
    const nameIdx = nameCol?.match(/^Column (\d+)$/)?.[1];
    const nameColIdx = nameIdx != null ? parseInt(nameIdx, 10) - 1 : null;
    const result = Papa.parse(text, { header: false, skipEmptyLines: true });
    return result.data.map((row, i) => ({
      name: nameColIdx !== null ? (row[nameColIdx]?.trim() || `Compound ${i+1}`) : `Compound ${i+1}`,
      smiles: row[smilesIdx]?.trim() || '',
    })).filter(c => c.smiles !== '');
  }
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  return result.data.map((row, i) => ({
    name: nameCol ? (row[nameCol]?.trim() || `Compound ${i+1}`) : `Compound ${i+1}`,
    smiles: row[smilesCol]?.trim() || '',
  })).filter(c => c.smiles !== '');
}

let pass = 0, fail = 0;
function assert(label, condition) {
  if (condition) { console.log(`  PASS: ${label}`); pass++; }
  else { console.log(`  FAIL: ${label}`); fail++; }
}

console.log('=== Test 1: headed CSV with known headers (name, smiles) ===');
const t1 = fs.readFileSync('playwright/fixtures/headed-known.csv', 'utf-8');
const r1 = parseCsvText(t1);
assert('auto-detected', r1.note === 'auto-detected');
assert('3 compounds', r1.compounds.length === 3);
assert('first is Aspirin', r1.compounds[0].name === 'Aspirin');
assert('first SMILES correct', r1.compounds[0].smiles === 'CC(=O)Oc1ccccc1C(=O)O');

console.log('\n=== Test 2: headed CSV with unrecognized 3-col headers (real header names preserved) ===');
const t2 = fs.readFileSync('playwright/fixtures/headed-unknown.csv', 'utf-8');
const r2 = parseCsvText(t2);
// 3+ unrecognized columns → keep real header names for manual mapping
assert('needs manual mapping', r2.needsManualMapping === true);
assert('real headers preserved', r2.headers && r2.headers[0] === 'mol_id');
assert('has canonical_smi header', r2.headers && r2.headers[2] === 'canonical_smi');
// Simulate user selecting canonical_smi as SMILES, mol_id as name
const extracted2 = extractCompoundsFromColumns(t2, 'canonical_smi', 'mol_id');
assert('extracted 3 compounds with real headers', extracted2.length === 3);
assert('first SMILES correct', extracted2[0].smiles === 'CCO');
assert('first name from mol_id', extracted2[0].name === 'A001');

console.log('\n=== Test 3: headerless 1-col (SMILES only) ===');
const t3 = fs.readFileSync('playwright/fixtures/headerless-1col.csv', 'utf-8');
const r3 = parseCsvText(t3);
assert('1-col auto', r3.note === '1-col auto');
assert('4 compounds', r3.compounds.length === 4);
assert('auto-named', r3.compounds[0].name === 'Compound 1');

console.log('\n=== Test 4: headerless 2-col (SMILES + name) ===');
const t4 = fs.readFileSync('playwright/fixtures/headerless-2col.csv', 'utf-8');
const r4 = parseCsvText(t4);
assert('2-col auto', r4.note === '2-col auto');
assert('3 compounds', r4.compounds.length === 3);
assert('name from col 2', r4.compounds[0].name === 'ethanol');
assert('SMILES from col 1', r4.compounds[0].smiles === 'CCO');

console.log('\n=== Test 5: headerless 3-col (THE BUG FIX) ===');
const t5 = fs.readFileSync('playwright/fixtures/headerless-3col.csv', 'utf-8');
const r5 = parseCsvText(t5);
assert('3+col manual mapping', r5.needsManualMapping === true);
assert('synthetic headers', r5.headers[0] === 'Column 1');
assert('ALL 5 rows preserved (not 4)', r5.rowCount === 5);

// Simulate user selecting Column 1 as SMILES, Column 2 as name
const extracted5 = extractCompoundsFromColumns(t5, 'Column 1', 'Column 2');
assert('extracted 5 compounds', extracted5.length === 5);
assert('first row NOT lost', extracted5[0].smiles === 'CCO');
assert('first name correct', extracted5[0].name === 'ethanol');
assert('last row present', extracted5[4].smiles === 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C');

console.log('\n=== Test 6: .smi tab-separated ===');
const t6 = fs.readFileSync('playwright/fixtures/test-compounds.smi', 'utf-8');
const lines6 = t6.split(/\r?\n/);
const c6 = [];
for (const line of lines6) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const match = trimmed.match(/^(\S+)\s+(.*)/);
  if (match) c6.push({ smiles: match[1], name: match[2].trim() || `Compound ${c6.length+1}` });
  else c6.push({ smiles: trimmed, name: `Compound ${c6.length+1}` });
}
assert('parsed tab .smi', c6.length === 5);
assert('first compound name', c6[0].name.length > 0);

console.log('\n=== Test 7: .smi space-separated with multi-word names ===');
const t7 = fs.readFileSync('playwright/fixtures/test-compounds-spaces.smi', 'utf-8');
const lines7 = t7.split(/\r?\n/);
const c7 = [];
for (const line of lines7) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const match = trimmed.match(/^(\S+)\s+(.*)/);
  if (match) c7.push({ smiles: match[1], name: match[2].trim() || `Compound ${c7.length+1}` });
  else c7.push({ smiles: trimmed, name: `Compound ${c7.length+1}` });
}
assert('parsed space .smi', c7.length === 5);
// Check multi-word name is preserved
const aceticAcid = c7.find(c => c.name === 'Acetic acid');
assert('multi-word name "Acetic acid" preserved', aceticAcid !== undefined);

console.log('\n=== Test 8: extractCompoundsFromColumns with REAL headers ===');
const extracted8 = extractCompoundsFromColumns(t1, 'smiles', 'name');
assert('real headers: 3 compounds', extracted8.length === 3);
assert('real headers: first is Aspirin', extracted8[0].name === 'Aspirin');

console.log('\n=== Test 9: headers with special chars NOT misdetected as data ===');
const t9 = 'Batch#,Notes (internal),ID#\nA,some note,001\nB,another note,002\n';
const r9 = parseCsvText(t9);
assert('real headers preserved (not treated as data)', r9.needsManualMapping === true);
assert('header is Batch# not Column 1', r9.headers && r9.headers[0] === 'Batch#');
assert('header is Notes (internal)', r9.headers && r9.headers[1] === 'Notes (internal)');

console.log(`\n========================================`);
console.log(`Results: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
