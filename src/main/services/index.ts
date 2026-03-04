import { EventEmitter } from 'node:events';
import { AppState } from '../models/state';
import { readRootDir } from './prefs';
import {
  loadState,
  startPersistenceFlusher,
  cleanupTempDir,
  persistState,
  scanIncompleteDownloads,
} from './storage';
import { BoltzClient } from './boltz-client';
import { Poller, recoverIncompleteDownloads } from './poller';

export class AppServices {
  state: AppState;
  eventBus: EventEmitter;
  client: BoltzClient;
  poller: Poller;
  private stopFlusher: () => void;

  private constructor(
    state: AppState,
    eventBus: EventEmitter,
    stopFlusher: () => void,
    client: BoltzClient,
    poller: Poller,
  ) {
    this.state = state;
    this.eventBus = eventBus;
    this.stopFlusher = stopFlusher;
    this.client = client;
    this.poller = poller;
  }

  static initialize(): AppServices {
    const rootDir = readRootDir();
    const state = loadState(rootDir);
    const eventBus = new EventEmitter();
    const stopFlusher = startPersistenceFlusher(state);

    // Cleanup temp directory from previous session
    cleanupTempDir(rootDir);

    // Create HTTP client and poller
    const client = new BoltzClient();
    const services = new AppServices(state, eventBus, stopFlusher, client, null!);
    const poller = new Poller(services, client);
    services.poller = poller;

    // Start the background poller
    poller.start();

    // Recover incomplete downloads in the background
    const incompleteDownloads = scanIncompleteDownloads(rootDir, state.data);
    if (incompleteDownloads.length > 0) {
      recoverIncompleteDownloads(services, client, incompleteDownloads).catch((err) => {
        console.error('Download recovery failed:', err);
      });
    }

    return services;
  }

  /** Graceful shutdown: stop poller, stop flusher, flush dirty state */
  shutdown(): void {
    this.poller.stop();
    this.stopFlusher();
    if (this.state.dirty) {
      this.state.dirty = false;
      persistState(this.state.rootDir, this.state.data);
    }
  }
}
