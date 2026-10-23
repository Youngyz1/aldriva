import type { RouteProvider } from './types';
import { OSRMProvider } from './osrm-provider';

export * from './types';
export * from './haversine';
export * from './osrm-provider';

let defaultProvider: RouteProvider | null = null;

export function getRouteProvider(): RouteProvider {
  if (!defaultProvider) {
    defaultProvider = new OSRMProvider();
  }
  return defaultProvider;
}

export function setRouteProviderForTesting(provider: RouteProvider | null): void {
  defaultProvider = provider;
}
