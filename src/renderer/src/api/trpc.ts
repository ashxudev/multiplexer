import { createTRPCReact } from '@trpc/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import { ipcLink } from 'trpc-electron/renderer';
import type { AppRouter } from '../../../main/trpc/router';

export const trpc = createTRPCReact<AppRouter>();

function isElectron(): boolean {
  return typeof window !== 'undefined' && 'electronTRPC' in window;
}

// ── Mock data for browser QA testing ─────────────────────────────────

const MOCK_CAMPAIGNS = [
  {
    id: 'mock-campaign-1',
    display_name: 'EGFR Inhibitor Screen',
    folder_name: 'egfr-inhibitor-screen',
    protein_sequence: 'MTEYKLVVVGAGGVGKSALTIQLIQNHFVDEYDPTIEDSY',
    description: 'Testing EGFR binding candidates',
    archived: false,
    archived_at: null,
    created_at: new Date().toISOString(),
    runs: [
      {
        id: 'mock-run-1',
        display_name: 'Batch 1',
        folder_name: 'batch-1',
        archived: false,
        archived_at: null,
        params: { recycling_steps: 3, diffusion_samples: 1, sampling_steps: 200, step_scale: 1.5 },
        created_at: new Date().toISOString(),
        completed_at: null,
        compounds: [
          {
            id: 'mock-compound-1',
            display_name: 'Aspirin',
            folder_name: 'aspirin',
            smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O',
            boltz_job_id: null,
            status: 'COMPLETED',
            submitted_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            metrics: {
              affinity: { binding_confidence: 0.847, optimization_score: 0.632 },
              samples: [{ structure_confidence: 0.91, iptm: 0.85, ligand_iptm: 0.78, complex_plddt: 72.5, ptm: 0.88, protein_iptm: 0.92, complex_iplddt: 68.3, complex_pde: 1.05, complex_ipde: 1.24, chains_ptm: null, pair_chains_iptm: null }],
            },
            error_message: null,
            download_error: null,
          },
          {
            id: 'mock-compound-2',
            display_name: 'Ibuprofen',
            folder_name: 'ibuprofen',
            smiles: 'CC(C)CC1=CC=C(C=C1)C(C)C(=O)O',
            boltz_job_id: 'pred-123',
            status: 'RUNNING',
            submitted_at: new Date().toISOString(),
            completed_at: null,
            metrics: null,
            error_message: null,
            download_error: null,
          },
          {
            id: 'mock-compound-3',
            display_name: 'Caffeine',
            folder_name: 'caffeine',
            smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C',
            boltz_job_id: null,
            status: 'FAILED',
            submitted_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            metrics: null,
            error_message: 'API rate limit exceeded',
            download_error: null,
          },
        ],
      },
    ],
  },
];

const MOCK_SETTINGS = {
  api_key: 'boltzpk_live_mock123',
  root_dir: '/Users/demo/multiplexer',
};

function getMockResponse(path: string, input: unknown): unknown {
  switch (path) {
    case 'campaigns.list':
      return MOCK_CAMPAIGNS;
    case 'settings.get':
      return MOCK_SETTINGS;
    case 'settings.testConnection':
      return true;
    case 'settings.selectRootDir':
      return '/Users/demo/new-workspace';
    case 'settings.save':
    case 'campaigns.create':
      return { ...MOCK_CAMPAIGNS[0], id: 'mock-new-' + Date.now() };
    case 'campaigns.rename':
    case 'campaigns.archive':
    case 'campaigns.unarchive':
    case 'runs.rename':
    case 'runs.archive':
    case 'runs.unarchive':
    case 'runs.cancel':
    case 'actions.openInFinder':
    case 'actions.openExternal':
      return null;
    case 'runs.get': {
      const runId = (input as { runId?: string })?.runId;
      for (const c of MOCK_CAMPAIGNS) {
        const run = c.runs.find((r) => r.id === runId);
        if (run) return run;
      }
      return MOCK_CAMPAIGNS[0].runs[0];
    }
    case 'runs.create':
      return MOCK_CAMPAIGNS[0].runs[0];
    case 'compounds.get': {
      const compId = (input as { compoundId?: string })?.compoundId;
      for (const c of MOCK_CAMPAIGNS) {
        for (const r of c.runs) {
          const comp = r.compounds.find((co) => co.id === compId);
          if (comp) return comp;
        }
      }
      return MOCK_CAMPAIGNS[0].runs[0].compounds[0];
    }
    case 'compounds.retry':
      return null;
    case 'compounds.getPoseCif':
      return 'data_mock\n_cell.length_a 50.0\n';
    case 'compounds.getPaeImageData':
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    default:
      console.warn(`[trpc mock] Unhandled path: ${path}`);
      return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockLink(): TRPCLink<any> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.type === 'subscription') {
          return () => {};
        }

        setTimeout(() => {
          try {
            const result = getMockResponse(op.path, op.input);
            observer.next({ result: { type: 'data', data: result } });
            observer.complete();
          } catch (e) {
            observer.error(e);
          }
        }, 100);

        return () => {};
      });
}

export function createTrpcClient() {
  if (isElectron()) {
    return trpc.createClient({
      links: [ipcLink()],
    });
  }

  console.warn('[trpc] Running in browser QA mode with mock data');
  return trpc.createClient({
    links: [mockLink()],
  });
}
