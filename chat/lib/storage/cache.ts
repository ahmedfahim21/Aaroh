/**
 * Client-side cache for NEAR storage to improve performance
 * Uses LRU cache with automatic invalidation
 */

import type { Conversation, Message } from '@/lib/near/storage';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum cache size
}

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_SIZE = 100; // 100 items

/**
 * LRU Cache implementation for NEAR data
 */
export class NearStorageCache {
  private cache: Map<string, CacheEntry<any>>;
  private accessOrder: string[];
  private maxSize: number;
  private defaultTtl: number;

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.accessOrder = [];
    this.maxSize = options.maxSize || DEFAULT_MAX_SIZE;
    this.defaultTtl = options.ttl || DEFAULT_TTL;
  }

  /**
   * Get item from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return null;
    }

    // Update access order (move to end)
    this.updateAccessOrder(key);

    return entry.data as T;
  }

  /**
   * Set item in cache
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.defaultTtl);

    // Evict if at max size
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt,
    });

    this.updateAccessOrder(key);
  }

  /**
   * Delete item from cache
   */
  delete(key: string): void {
    this.cache.delete(key);
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // TODO: Track hits/misses
    };
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(key: string): void {
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    this.accessOrder.push(key);
  }

  /**
   * Evict least recently used item
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const lruKey = this.accessOrder[0];
    this.delete(lruKey);
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.delete(key);
    }
  }
}

/**
 * Cached NEAR storage wrapper
 * Wraps NearMemoryClient with caching layer
 */
export class CachedNearStorage {
  private cache: NearStorageCache;

  constructor(options: CacheOptions = {}) {
    this.cache = new NearStorageCache(options);

    // Periodic cleanup
    if (typeof window !== 'undefined') {
      setInterval(() => this.cache.cleanup(), 60000); // Every minute
    }
  }

  /**
   * Cache key for conversation
   */
  private conversationKey(chatId: string): string {
    return `conversation:${chatId}`;
  }

  /**
   * Cache key for conversation list
   */
  private conversationListKey(fromIndex: number, limit: number): string {
    return `conversations:${fromIndex}:${limit}`;
  }

  /**
   * Cache key for cart
   */
  private cartKey(): string {
    return 'cart';
  }

  /**
   * Get cached conversation or fetch from NEAR
   */
  async getCachedConversation(
    chatId: string,
    fetchFn: () => Promise<Conversation | null>
  ): Promise<Conversation | null> {
    const cacheKey = this.conversationKey(chatId);

    // Check cache first
    const cached = this.cache.get<Conversation>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from NEAR
    const conversation = await fetchFn();

    if (conversation) {
      // Cache for 5 minutes
      this.cache.set(cacheKey, conversation);
    }

    return conversation;
  }

  /**
   * Get cached conversations list
   */
  async getCachedConversations(
    fromIndex: number,
    limit: number,
    fetchFn: () => Promise<Array<{ chatId: string; conversation: Conversation }>>
  ): Promise<Array<{ chatId: string; conversation: Conversation }>> {
    const cacheKey = this.conversationListKey(fromIndex, limit);

    // Check cache
    const cached = this.cache.get<Array<{ chatId: string; conversation: Conversation }>>(
      cacheKey
    );
    if (cached) {
      return cached;
    }

    // Fetch from NEAR
    const conversations = await fetchFn();

    // Cache for 2 minutes (lists change more frequently)
    this.cache.set(cacheKey, conversations, 2 * 60 * 1000);

    // Also cache individual conversations
    for (const { chatId, conversation } of conversations) {
      this.cache.set(this.conversationKey(chatId), conversation);
    }

    return conversations;
  }

  /**
   * Get cached cart
   */
  async getCachedCart<T>(fetchFn: () => Promise<T | null>): Promise<T | null> {
    const cacheKey = this.cartKey();

    // Check cache
    const cached = this.cache.get<T>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from NEAR
    const cart = await fetchFn();

    if (cart) {
      // Cache for 1 minute (cart changes frequently)
      this.cache.set(cacheKey, cart, 60 * 1000);
    }

    return cart;
  }

  /**
   * Invalidate conversation cache
   */
  invalidateConversation(chatId: string): void {
    this.cache.delete(this.conversationKey(chatId));

    // Also invalidate list caches (they contain this conversation)
    for (const key of Array.from(this.cache['cache'].keys())) {
      if (key.startsWith('conversations:')) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Invalidate cart cache
   */
  invalidateCart(): void {
    this.cache.delete(this.cartKey());
  }

  /**
   * Invalidate all caches
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getStats() {
    return this.cache.getStats();
  }
}

/**
 * Optimistic update helper
 * Update UI immediately, sync to NEAR in background
 */
export class OptimisticUpdater {
  private pendingUpdates: Map<string, Promise<void>>;

  constructor() {
    this.pendingUpdates = new Map();
  }

  /**
   * Perform optimistic update
   */
  async update<T>(
    key: string,
    optimisticFn: () => T,
    syncFn: () => Promise<void>
  ): Promise<T> {
    // Apply optimistic update immediately
    const result = optimisticFn();

    // Sync to NEAR in background
    const syncPromise = syncFn().catch((error) => {
      console.error(`Failed to sync ${key}:`, error);
      // TODO: Implement rollback or retry logic
    });

    this.pendingUpdates.set(key, syncPromise);

    // Clean up when done
    syncPromise.finally(() => {
      this.pendingUpdates.delete(key);
    });

    return result;
  }

  /**
   * Wait for all pending updates
   */
  async waitForAll(): Promise<void> {
    await Promise.all(this.pendingUpdates.values());
  }

  /**
   * Check if updates are pending
   */
  hasPending(): boolean {
    return this.pendingUpdates.size > 0;
  }
}

/**
 * Global cache instance
 */
export const nearStorageCache = new CachedNearStorage({
  ttl: 5 * 60 * 1000, // 5 minutes
  maxSize: 100,
});

/**
 * Global optimistic updater
 */
export const optimisticUpdater = new OptimisticUpdater();
