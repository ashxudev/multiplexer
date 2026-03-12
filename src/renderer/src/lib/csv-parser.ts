import Papa from 'papaparse';
import type { ParsedCompound } from '@/types/compounds';

const SMILES_HEADERS = new Set([
  'smiles',
  'canonical_smiles',
  'smiles_string',
  'smi',
  'molecule',
  'compound_smiles',
  'ligand_smiles',
  'structure',
]);

const NAME_HEADERS = new Set([
  'name',
  'compound_name',
  'compound',
  'id',
  'compound_id',
  'mol_name',
  'title',
  'label',
  'molecule_name',
]);

export interface CsvParseResult {
  compounds: ParsedCompound[];
  headers: string[] | null;
  detectedSmilesCol: string | null;
  detectedNameCol: string | null;
  needsManualMapping: boolean;
}

function detectColumn(fields: string[], knownHeaders: Set<string>): string | null {
  for (const field of fields) {
    if (knownHeaders.has(field.trim().toLowerCase())) {
      return field;
    }
  }
  return null;
}

export function parseCsvText(text: string): CsvParseResult {
  const headerResult = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  const fields = headerResult.meta.fields ?? [];

  if (fields.length > 0) {
    const smilesCol = detectColumn(fields, SMILES_HEADERS);
    const nameCol = detectColumn(fields, NAME_HEADERS);

    if (smilesCol) {
      const compounds = headerResult.data.map((row, i) => ({
        name: nameCol ? (row[nameCol]?.trim() || `Compound ${i + 1}`) : `Compound ${i + 1}`,
        smiles: row[smilesCol]?.trim() || '',
      })).filter((c) => c.smiles !== '');

      return {
        compounds,
        headers: fields,
        detectedSmilesCol: smilesCol,
        detectedNameCol: nameCol,
        needsManualMapping: false,
      };
    }

    // No recognized headers — try headerless heuristics
    // If the "header" row itself looks like data (no fields match any known header
    // and column count is 1 or 2), re-parse without headers
    if (fields.length <= 2) {
      return parseHeaderless(text);
    }

    // More than 2 unrecognized columns — need manual mapping
    return {
      compounds: [],
      headers: fields,
      detectedSmilesCol: null,
      detectedNameCol: null,
      needsManualMapping: true,
    };
  }

  // No fields at all — try headerless
  return parseHeaderless(text);
}

function parseHeaderless(text: string): CsvParseResult {
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
  });

  const rows = result.data;
  if (rows.length === 0) {
    return { compounds: [], headers: null, detectedSmilesCol: null, detectedNameCol: null, needsManualMapping: false };
  }

  const colCount = rows[0].length;

  if (colCount === 1) {
    // Single column — all SMILES
    const compounds = rows.map((row, i) => ({
      name: `Compound ${i + 1}`,
      smiles: row[0]?.trim() || '',
    })).filter((c) => c.smiles !== '');
    return { compounds, headers: null, detectedSmilesCol: null, detectedNameCol: null, needsManualMapping: false };
  }

  if (colCount === 2) {
    // Two columns — col 0 = name, col 1 = SMILES
    const compounds = rows.map((row, i) => ({
      name: row[0]?.trim() || `Compound ${i + 1}`,
      smiles: row[1]?.trim() || '',
    })).filter((c) => c.smiles !== '');
    return { compounds, headers: null, detectedSmilesCol: null, detectedNameCol: null, needsManualMapping: false };
  }

  // More columns without headers — can't guess, need manual mapping
  // Generate generic header names
  const headers = rows[0].map((_, i) => `Column ${i + 1}`);
  return { compounds: [], headers, detectedSmilesCol: null, detectedNameCol: null, needsManualMapping: true };
}

export function extractCompoundsFromColumns(
  text: string,
  smilesCol: string,
  nameCol: string | null,
): ParsedCompound[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  return result.data
    .map((row, i) => ({
      name: nameCol ? (row[nameCol]?.trim() || `Compound ${i + 1}`) : `Compound ${i + 1}`,
      smiles: row[smilesCol]?.trim() || '',
    }))
    .filter((c) => c.smiles !== '');
}
