import { invoke } from "@tauri-apps/api/core";
import type {
  Campaign,
  Compound,
  Run,
  RunParams,
} from "@/stores/useAppStore";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface Settings {
  api_key: string | null;
  root_dir: string;
}

export async function getSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

export async function saveSettings(
  apiKey?: string | null,
  rootDir?: string | null
): Promise<void> {
  return invoke("save_settings", {
    apiKey: apiKey ?? undefined,
    rootDir: rootDir ?? undefined,
  });
}

export async function testConnection(): Promise<boolean> {
  return invoke<boolean>("test_connection");
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export async function getCampaigns(): Promise<Campaign[]> {
  return invoke<Campaign[]>("get_campaigns");
}

export async function createCampaign(
  displayName: string,
  proteinSequence: string,
  description?: string
): Promise<Campaign> {
  return invoke<Campaign>("create_campaign", {
    displayName,
    proteinSequence,
    description: description ?? null,
  });
}

export async function renameCampaign(
  campaignId: string,
  newName: string
): Promise<void> {
  return invoke("rename_campaign", { campaignId, newName });
}

export async function archiveCampaign(campaignId: string): Promise<void> {
  return invoke("archive_campaign", { campaignId });
}

export async function unarchiveCampaign(campaignId: string): Promise<void> {
  return invoke("unarchive_campaign", { campaignId });
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export interface CompoundInput {
  name: string;
  smiles: string;
}

export async function createRun(
  campaignId: string,
  displayName: string,
  compounds: CompoundInput[],
  params: RunParams
): Promise<Run> {
  return invoke<Run>("create_run", {
    campaignId,
    displayName,
    compounds,
    params,
  });
}

export async function getRun(runId: string): Promise<Run> {
  return invoke<Run>("get_run", { runId });
}

export async function renameRun(
  runId: string,
  newName: string
): Promise<void> {
  return invoke("rename_run", { runId, newName });
}

export async function archiveRun(runId: string): Promise<void> {
  return invoke("archive_run", { runId });
}

export async function unarchiveRun(runId: string): Promise<void> {
  return invoke("unarchive_run", { runId });
}

export async function cancelRun(runId: string): Promise<void> {
  return invoke("cancel_run", { runId });
}

export async function retryCompound(compoundId: string): Promise<void> {
  return invoke("retry_compound", { compoundId });
}

// ---------------------------------------------------------------------------
// Compounds
// ---------------------------------------------------------------------------

export async function getCompound(compoundId: string): Promise<Compound> {
  return invoke<Compound>("get_compound", { compoundId });
}

export async function getPoseCif(
  compoundId: string,
  sampleIndex: number
): Promise<string> {
  return invoke<string>("get_pose_cif", { compoundId, sampleIndex });
}

export async function getPaeImagePath(
  compoundId: string,
  sampleIndex: number
): Promise<string> {
  return invoke<string>("get_pae_image_path", { compoundId, sampleIndex });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function openInFinder(compoundId: string): Promise<void> {
  return invoke("open_in_finder", { compoundId });
}

export async function openStructureExternal(
  compoundId: string,
  sampleIndex: number
): Promise<void> {
  return invoke("open_structure_external", { compoundId, sampleIndex });
}
