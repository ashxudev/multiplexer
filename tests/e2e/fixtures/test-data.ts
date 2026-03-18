// API key loaded from environment — never hardcoded.
// Set BOLTZ_API_KEY in .env.local or export it before running tests.
export function getApiKey(): string {
  const key = process.env.BOLTZ_API_KEY;
  if (!key) {
    throw new Error(
      'BOLTZ_API_KEY not set. Export it or add to .env.local before running tests.',
    );
  }
  return key;
}

// Short protein sequence for testing (human insulin chain A)
export const TEST_PROTEIN_SEQUENCE = 'GIVEQCCTSICSLYQLENYCN';

// Simple, well-known SMILES for testing — kept small for fast API response
export const TEST_COMPOUNDS = [
  { name: 'Aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { name: 'Ethanol', smiles: 'CCO' },
];

// Invalid SMILES for validation testing
export const INVALID_SMILES = 'NOT_A_REAL_SMILES';

export const TEST_CAMPAIGN_NAME = 'E2E Test Campaign';
export const TEST_RUN_NAME = 'E2E Test Run';

// Minimal parameters to speed up API tests
export const FAST_PARAMS = {
  recyclingSteps: 1,
  diffusionSamples: 1,
  samplingSteps: 50,
  stepScale: 1.5,
};
