/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DataAdapterBase,
  DataAdapterCapability,
  IDataAdapterContext,
  IDataAdapterResult,
  IDataAdapterPropertyDefinition,
  IPlatformServices,
  PlatformServiceKey
} from '@mrpullen/spfx-extensibility';
import { UserProfileService } from '../services/UserProfileService';
import { ListDataService } from '../services/ListDataService';

/**
 * Built-in adapter for the current user's profile.
 *
 * Wraps UserProfileService.  Read-only, fetches the full profile from
 * PnPjs sp.profiles and caches it for 24 hours.
 *
 * Typically used as a singleton instance named "user" so templates
 * can reference {{user.email}}, {{user.displayName}}, etc.
 */
export class UserProfileAdapter extends DataAdapterBase {
  public readonly adapterId = 'user-profile';
  public readonly adapterName = 'User Profile';
  public readonly capability: DataAdapterCapability = 'read';

  private inner: UserProfileService;

  constructor(services: IPlatformServices) {
    super(services);
    // eslint-disable-next-line dot-notation
    const sp = services['sp'];
    this.inner = new UserProfileService(sp);
  }

  public getRequiredServices(): PlatformServiceKey[] { return ['sp']; }

  public async fetch(_context: IDataAdapterContext): Promise<IDataAdapterResult> {
    try {
      const profile = await this.inner.getCurrentUserProfile();
      // Normalize so dot-notation fields, multi-lookup strings, etc. match
      // the shape templates already expect for list rows.
      return { data: ListDataService.normalizeData(profile as Record<string, any>), fromCache: false };
    } catch (err) {
      return { data: {}, error: err instanceof Error ? err.message : String(err) };
    }
  }

  public getPropertyDefinitions(): IDataAdapterPropertyDefinition[] {
    // No configuration needed — always fetches the current user
    return [];
  }

  public clearCache(): void {
    this.inner.clearCache();
  }
}
