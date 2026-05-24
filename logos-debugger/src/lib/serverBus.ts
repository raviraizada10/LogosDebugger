import { Subject } from 'rxjs';

export interface TelemetryEvent {
  sessionId: string;
  timestamp: number;
  token?: string;
  event?: unknown;
  status?: string;
}

// Persist the Subject on the global object during Next.js hot-reloads
const globalForBus = global as unknown as {
  serverTelemetryBus?: Subject<TelemetryEvent>;
};

export const serverTelemetryBus =
  globalForBus.serverTelemetryBus ?? new Subject<TelemetryEvent>();

if (process.env.NODE_ENV !== 'production') {
  globalForBus.serverTelemetryBus = serverTelemetryBus;
}
