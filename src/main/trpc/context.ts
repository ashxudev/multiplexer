import type { AppServices } from '../services';

export interface TRPCContext {
  services: AppServices;
}

export function createContext(services: AppServices): TRPCContext {
  return { services };
}
