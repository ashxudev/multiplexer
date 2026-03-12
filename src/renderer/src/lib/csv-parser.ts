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

    // No recognized headers — check if the first row looks like data
    // (contains SMILES-like patterns) rather than real column names.
    // Require letter/digit adjacent to a bond or bracket (e.g. "C(=O)", "c1ccc",
    // "[NH]") to avoid false positives on headers like "Batch#" or "Notes (internal)".
    const SMILES_PATTERN = /[A-Za-z]\(|[A-Za-z]\[|\][A-Za-z]|\d[a-z]|[a-z]\d|=[A-Z]/;
    const looksLikeData = fields.some((f) => SMILES_PATTERN.test(f) || /^\d+(\.\d+)?$/.test(f.trim()));
    if (fields.length <= 2 || looksLikeData) {
      return parseHeaderless(text);
    }

    // 3+ columns with text-like headers — keep as real column names for manual mapper
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
    // Two columns — col 0 = SMILES, col 1 = name (standard .smi format)
    const compounds = rows.map((row, i) => ({
      name: row[1]?.trim() || `Compound ${i + 1}`,
      smiles: row[0]?.trim() || '',
    })).filter((c) => c.smiles !== '');
    return { compounds, headers: null, detectedSmilesCol: null, detectedNameCol: null, needsManualMapping: false };
  }

  // More columns without headers — can't guess, need manual mapping
  // Generate generic header names
  const headers = rows[0].map((_, i) => `Column ${i + 1}`);
  return { compounds: [], headers, detectedSmilesCol: null, detectedNameCol: null, needsManualMapping: true };
}

const SMI_EXTENSIONS = new Set(['smi', 'smiles']);

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

/**
 * Parse a .smi/.smiles file: each line is SMILES followed by optional
 * whitespace + name. Splits on the first whitespace character so
 * multi-word names (e.g. "Acetic acid") are preserved.
 */
function parseSmiText(text: string): CsvParseResult {
  const compounds: ParsedCompound[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue; // skip blank lines and comments

    const match = line.match(/^(\S+)\s+(.*)/);
    if (match) {
      compounds.push({
        smiles: match[1],
        name: match[2].trim() || `Compound ${compounds.length + 1}`,
      });
    } else {
      // Single token — SMILES only, no name
      compounds.push({
        smiles: line,
        name: `Compound ${compounds.length + 1}`,
      });
    }
  }

  return {
    compounds,
    headers: null,
    detectedSmilesCol: null,
    detectedNameCol: null,
    needsManualMapping: false,
  };
}

/**
 * Entry point: routes to the appropriate parser based on file extension.
 * .smi/.smiles → dedicated whitespace-splitting parser
 * Everything else → PapaParse CSV/TSV parser with header auto-detection
 */
export function parseFile(text: string, fileName: string): CsvParseResult {
  const ext = getExtension(fileName);
  if (SMI_EXTENSIONS.has(ext)) {
    return parseSmiText(text);
  }
  return parseCsvText(text);
}

export function extractCompoundsFromColumns(
  text: string,
  smilesCol: string,
  nameCol: string | null,
): ParsedCompound[] {
  // Synthetic "Column N" headers come from headerless parsing — use index-based access
  const smilesIdxMatch = smilesCol.match(/^Column (\d+)$/);
  if (smilesIdxMatch) {
    const smilesIdx = parseInt(smilesIdxMatch[1], 10) - 1;
    const nameIdx = nameCol?.match(/^Column (\d+)$/)?.[1];
    const nameColIdx = nameIdx != null ? parseInt(nameIdx, 10) - 1 : null;

    const result = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: true,
    });

    return result.data
      .map((row, i) => ({
        name: nameColIdx !== null ? (row[nameColIdx]?.trim() || `Compound ${i + 1}`) : `Compound ${i + 1}`,
        smiles: row[smilesIdx]?.trim() || '',
      }))
      .filter((c) => c.smiles !== '');
  }

  // Real headers — parse with header: true
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
