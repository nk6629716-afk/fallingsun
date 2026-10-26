/**
 * SENTINEL Mesh Bus & Multi-Tab Channel
 * FIX-12: Single BroadcastChannel "sentinel_mesh_bus", canonical envelope,
 * LRU deduplication (500 entries), own-origin filtering, and schema validation.
 */

export interface MeshBusEnvelope<T = any> {
  id: string;
  type: string;
  ts: number;
  origin: string;
  payload: T;
  v: 1;
}

export type MeshBusHandler<T = any> = (envelope: MeshBusEnvelope<T>) => void;

class SimpleLRU<K> {
  private capacity: number;
  private set: Set<K> = new Set();

  constructor(capacity: number = 500) {
    this.capacity = capacity;
  }

  public has(key: K): boolean {
    return this.set.has(key);
  }

  public add(key: K): void {
    if (this.set.has(key)) {
      this.set.delete(key);
      this.set.add(key);
      return;
    }
    if (this.set.size >= this.capacity) {
      const oldest = this.set.values().next().value;
      if (oldest !== undefined) {
        this.set.delete(oldest);
      }
    }
    this.set.add(key);
  }

  public clear(): void {
    this.set.clear();
  }
}

export class MeshBus {
  private channelName = 'sentinel_mesh_bus';
  private channel: BroadcastChannel | null = null;
  private tabId: string;
  private seenIds = new SimpleLRU<string>(500);
  private listeners: Map<string, Set<MeshBusHandler>> = new Map();
  private wildcardListeners: Set<MeshBusHandler> = new Set();

  constructor(customTabId?: string, customChannel?: BroadcastChannel | null) {
    this.tabId = customTabId || this.generateUUID();
    if (customChannel !== undefined) {
      this.channel = customChannel;
      if (this.channel) {
        this.setupChannelListener(this.channel);
      }
    } else {
      this.initChannel();
    }
  }

  public getTabId(): string {
    return this.tabId;
  }

  public generateUUID(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      try {
        return crypto.randomUUID();
      } catch {
        // Fallback below
      }
    }
    return 'uuid-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
  }

  private initChannel(): void {
    const ChannelCtor =
      (typeof window !== 'undefined' && (window as any).BroadcastChannel) ||
      (typeof BroadcastChannel !== 'undefined' ? BroadcastChannel : null);

    if (ChannelCtor) {
      try {
        this.channel = new ChannelCtor(this.channelName);
        if (this.channel) {
          this.setupChannelListener(this.channel);
          // Node BroadcastChannel should not keep CLI/test processes alive.
          (this.channel as BroadcastChannel & { unref?: () => void }).unref?.();
        }
      } catch (err) {
        console.warn('[MeshBus] BroadcastChannel not supported:', err);
      }
    }
  }

  private setupChannelListener(channel: BroadcastChannel): void {
    channel.onmessage = (event: MessageEvent) => {
      this.handleIncoming(event.data);
    };
  }

  /**
   * Validates schema and processes incoming broadcast message safely
   */
  public handleIncoming(data: any): boolean {
    // 1. Validate envelope schema
    if (
      !data ||
      typeof data !== 'object' ||
      typeof data.id !== 'string' ||
      typeof data.type !== 'string' ||
      typeof data.ts !== 'number' ||
      typeof data.origin !== 'string' ||
      data.v !== 1 ||
      !('payload' in data)
    ) {
      // Ignore malformed message without throwing (FIX-12)
      return false;
    }

    const envelope = data as MeshBusEnvelope;

    // 2. Ignore self-origin messages
    if (envelope.origin === this.tabId) {
      return false;
    }

    // 3. Deduplicate by message ID using LRU of 500 entries
    if (this.seenIds.has(envelope.id)) {
      return false;
    }
    this.seenIds.add(envelope.id);

    // 4. Dispatch to subscribers
    const typeHandlers = this.listeners.get(envelope.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          handler(envelope);
        } catch (err) {
          console.error('[MeshBus] Handler error:', err);
        }
      }
    }

    for (const handler of this.wildcardListeners) {
      try {
        handler(envelope);
      } catch (err) {
        console.error('[MeshBus] Wildcard handler error:', err);
      }
    }

    return true;
  }

  /**
   * Publishes a message adhering to the canonical envelope
   */
  public publish<T>(type: string, payload: T, customId?: string): MeshBusEnvelope<T> {
    const envelope: MeshBusEnvelope<T> = {
      id: customId || this.generateUUID(),
      type,
      ts: Date.now(),
      origin: this.tabId,
      payload,
      v: 1,
    };

    // Mark as seen so self does not re-apply
    this.seenIds.add(envelope.id);

    if (this.channel) {
      try {
        this.channel.postMessage(envelope);
      } catch (err) {
        console.warn('[MeshBus] postMessage error:', err);
      }
    }

    return envelope;
  }

  /**
   * Subscribes to a specific event type
   */
  public subscribe<T = any>(type: string, handler: MeshBusHandler<T>): () => void {
    if (type === '*') {
      this.wildcardListeners.add(handler);
      return () => {
        this.wildcardListeners.delete(handler);
      };
    }

    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);

    return () => {
      const handlers = this.listeners.get(type);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.listeners.delete(type);
        }
      }
    };
  }

  public close(): void {
    if (this.channel) {
      try {
        this.channel.close();
      } catch (err) {
        console.warn('[MeshBus] close error:', err);
      }
      this.channel = null;
    }
    this.listeners.clear();
    this.wildcardListeners.clear();
    this.seenIds.clear();
  }
}

export const meshBus = new MeshBus();
