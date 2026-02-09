/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ICacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface ICacheLock {
  key: string;
  timestamp: number;
  expiresAt: number;
}

export interface ICacheConfig {
  /** Cache timeout in minutes */
  timeoutMinutes: number;
  /** Storage key prefix */
  keyPrefix: string;
  /** Mutex wait timeout in milliseconds (default: 500ms) */
  mutexWaitMs: number;
  /** Mutex check interval in milliseconds (default: 50ms) */
  mutexCheckIntervalMs: number;
  /** Mutex lock expiry in milliseconds (default: 10000ms / 10s) - prevents deadlocks */
  mutexLockExpiryMs: number;
}

const DEFAULT_CONFIG: ICacheConfig = {
  timeoutMinutes: 15,
  keyPrefix: 'hbwp_cache_',
  mutexWaitMs: 500,
  mutexCheckIntervalMs: 50,
  mutexLockExpiryMs: 10000
};

const LOCK_PREFIX = 'hbwp_lock_';

export class CacheService {
  private config: ICacheConfig;

  constructor(config?: Partial<ICacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Gets the full storage key with prefix
   */
  private getStorageKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  /**
   * Gets the lock key for a cache key
   */
  private getLockKey(key: string): string {
    return `${LOCK_PREFIX}${key}`;
  }

  /**
   * Attempts to acquire a lock for a key
   * Returns true if lock acquired, false if already locked by another process
   */
  private tryAcquireLock(key: string): boolean {
    try {
      const lockKey = this.getLockKey(key);
      const existingLock = localStorage.getItem(lockKey);
      
      if (existingLock) {
        const lock: ICacheLock = JSON.parse(existingLock);
        // Check if existing lock has expired (prevents deadlocks)
        if (Date.now() < lock.expiresAt) {
          return false; // Lock is still valid
        }
        // Lock expired, we can take it
      }
      
      // Acquire the lock
      const now = Date.now();
      const lock: ICacheLock = {
        key,
        timestamp: now,
        expiresAt: now + this.config.mutexLockExpiryMs
      };
      localStorage.setItem(lockKey, JSON.stringify(lock));
      return true;
    } catch (error) {
      console.warn(`CacheService: Error acquiring lock for ${key}:`, error);
      return true; // On error, proceed without lock to avoid blocking
    }
  }

  /**
   * Releases a lock for a key
   */
  private releaseLock(key: string): void {
    try {
      const lockKey = this.getLockKey(key);
      localStorage.removeItem(lockKey);
    } catch (error) {
      console.warn(`CacheService: Error releasing lock for ${key}:`, error);
    }
  }

  /**
   * Checks if a key is currently locked
   */
  private isLocked(key: string): boolean {
    try {
      const lockKey = this.getLockKey(key);
      const existingLock = localStorage.getItem(lockKey);
      
      if (!existingLock) {
        return false;
      }
      
      const lock: ICacheLock = JSON.parse(existingLock);
      // Check if lock has expired
      if (Date.now() >= lock.expiresAt) {
        localStorage.removeItem(lockKey);
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Waits for a lock to be released or timeout
   * Returns true if lock was released, false if timed out
   */
  private async waitForLock(key: string): Promise<boolean> {
    const startTime = Date.now();
    const maxWait = this.config.mutexWaitMs;
    const checkInterval = this.config.mutexCheckIntervalMs;
    
    while (Date.now() - startTime < maxWait) {
      if (!this.isLocked(key)) {
        return true;
      }
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    return false; // Timed out
  }

  /**
   * Gets data from cache if valid, otherwise returns undefined
   */
  public get<T>(key: string): T | undefined {
    try {
      const storageKey = this.getStorageKey(key);
      const cached = localStorage.getItem(storageKey);
      
      if (!cached) {
        return undefined;
      }

      const entry: ICacheEntry<T> = JSON.parse(cached);
      
      // Check if cache has expired
      if (Date.now() > entry.expiresAt) {
        this.remove(key);
        return undefined;
      }

      return entry.data;
    } catch (error) {
      console.warn(`CacheService: Error reading cache for key ${key}:`, error);
      return undefined;
    }
  }

  /**
   * Sets data in cache with expiration
   */
  public set<T>(key: string, data: T, timeoutMinutes?: number): void {
    try {
      const storageKey = this.getStorageKey(key);
      const timeout = timeoutMinutes ?? this.config.timeoutMinutes;
      const now = Date.now();
      
      const entry: ICacheEntry<T> = {
        data,
        timestamp: now,
        expiresAt: now + (timeout * 60 * 1000)
      };

      localStorage.setItem(storageKey, JSON.stringify(entry));
    } catch (error) {
      console.warn(`CacheService: Error setting cache for key ${key}:`, error);
    }
  }

  /**
   * Removes a specific key from cache
   */
  public remove(key: string): void {
    try {
      const storageKey = this.getStorageKey(key);
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn(`CacheService: Error removing cache for key ${key}:`, error);
    }
  }

  /**
   * Clears all cache entries with this prefix
   */
  public clearAll(): void {
    try {
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.config.keyPrefix)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.warn('CacheService: Error clearing cache:', error);
    }
  }

  /**
   * Checks if a cache entry exists and is valid
   */
  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Gets data from cache or fetches it using the provided function.
   * Uses a mutex to prevent multiple simultaneous fetches for the same key.
   * If another process is fetching, this will wait up to mutexWaitMs for the cache to be populated.
   */
  public async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    timeoutMinutes?: number
  ): Promise<T> {
    // First check: is data already cached?
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    // Check if another process is currently fetching this key
    if (this.isLocked(key)) {
      // Wait for the other process to finish
      const lockReleased = await this.waitForLock(key);
      
      if (lockReleased) {
        // Check cache again - should be populated now
        const cachedAfterWait = this.get<T>(key);
        if (cachedAfterWait !== undefined) {
          return cachedAfterWait;
        }
      }
      // If we timed out or cache still empty, proceed to fetch ourselves
    }

    // Try to acquire lock
    const lockAcquired = this.tryAcquireLock(key);
    
    // Double-check cache (another process might have just finished)
    const cachedBeforeFetch = this.get<T>(key);
    if (cachedBeforeFetch !== undefined) {
      if (lockAcquired) {
        this.releaseLock(key);
      }
      return cachedBeforeFetch;
    }

    try {
      // Fetch the data
      const data = await fetchFn();
      this.set(key, data, timeoutMinutes);
      return data;
    } finally {
      // Always release lock if we acquired it
      if (lockAcquired) {
        this.releaseLock(key);
      }
    }
  }

  /**
   * Clears all locks (useful for cleanup)
   */
  public clearAllLocks(): void {
    try {
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCK_PREFIX)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.warn('CacheService: Error clearing locks:', error);
    }
  }
}

// Export a singleton instance for convenience
export const cacheService = new CacheService();
