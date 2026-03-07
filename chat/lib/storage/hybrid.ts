/**
 * Hybrid storage layer that supports both PostgreSQL and NEAR storage
 * Routes to appropriate backend based on user preference
 */

import type { ArtifactKind } from '@/components/artifact';
import type { VisibilityType } from '@/components/visibility-selector';
import {
  createNearMemoryClient,
  type NearMemoryClient,
} from '@/lib/near/storage';
import * as pgQueries from '@/lib/db/queries';
import type { Chat, DBMessage, User } from '@/lib/db/schema';

export type StorageBackend = 'postgres' | 'near';

/**
 * Message format for hybrid storage
 */
export interface HybridMessage {
  id: string;
  chatId: string;
  role: string;
  parts: any;
  attachments: any;
  createdAt: Date;
}

/**
 * Hybrid storage client that routes to PostgreSQL or NEAR
 */
export class HybridStorage {
  private nearClient: NearMemoryClient | null = null;
  private backend: StorageBackend;
  private userId: string;
  private nearAccountId: string | null;

  constructor(
    userId: string,
    backend: StorageBackend = 'postgres',
    nearAccountId: string | null = null
  ) {
    this.userId = userId;
    this.backend = backend;
    this.nearAccountId = nearAccountId;
  }

  /**
   * Initialize NEAR client if needed
   */
  private async ensureNearClient(): Promise<NearMemoryClient> {
    if (this.nearClient) return this.nearClient;

    if (!this.nearAccountId) {
      throw new Error('NEAR account ID required for NEAR storage');
    }

    this.nearClient = await createNearMemoryClient(this.nearAccountId);

    // Check if contract is deployed
    const isDeployed = await this.nearClient.ensureContractDeployed();
    if (!isDeployed) {
      throw new Error(
        `NEAR contract not deployed for ${this.nearAccountId}. Please deploy first.`
      );
    }

    return this.nearClient;
  }

  /**
   * Get storage backend
   */
  getBackend(): StorageBackend {
    return this.backend;
  }

  /**
   * Switch storage backend
   */
  setBackend(backend: StorageBackend) {
    this.backend = backend;
  }

  // ============= CHAT OPERATIONS =============

  /**
   * Save a chat
   */
  async saveChat(params: {
    id: string;
    title: string;
    visibility: VisibilityType;
  }): Promise<void> {
    const { id, title, visibility } = params;

    if (this.backend === 'near') {
      const client = await this.ensureNearClient();
      // Create empty conversation on NEAR
      await client.saveConversation(id, [], title, visibility);
    } else {
      // Save to PostgreSQL
      await pgQueries.saveChat({
        id,
        userId: this.userId,
        title,
        visibility,
      });
    }
  }

  /**
   * Get chat by ID
   */
  async getChatById(id: string): Promise<Chat | null> {
    if (this.backend === 'near') {
      const client = await this.ensureNearClient();
      const conversation = await client.getConversation(id);

      if (!conversation) return null;

      // Convert NEAR conversation to Chat format
      return {
        id: conversation.id,
        createdAt: new Date(conversation.created_at / 1_000_000),
        title: conversation.title,
        userId: this.userId,
        visibility: conversation.visibility as VisibilityType,
      };
    } else {
      return await pgQueries.getChatById({ id });
    }
  }

  /**
   * Get chats by user ID
   */
  async getChatsByUserId(): Promise<Chat[]> {
    if (this.backend === 'near') {
      const client = await this.ensureNearClient();
      const conversations = await client.listConversations(0, 100);

      // Convert NEAR conversations to Chat format
      return conversations.map(({ chatId, conversation }) => ({
        id: chatId,
        createdAt: new Date(conversation.created_at / 1_000_000),
        title: conversation.title,
        userId: this.userId,
        visibility: conversation.visibility as VisibilityType,
      }));
    } else {
      return await pgQueries.getChatsByUserId({ id: this.userId });
    }
  }

  /**
   * Delete chat
   */
  async deleteChatById(id: string): Promise<void> {
    if (this.backend === 'near') {
      const client = await this.ensureNearClient();
      await client.deleteConversation(id);
    } else {
      await pgQueries.deleteChatById({ id });
    }
  }

  // ============= MESSAGE OPERATIONS =============

  /**
   * Save messages
   */
  async saveMessages(params: { messages: HybridMessage[] }): Promise<void> {
    const { messages } = params;

    if (messages.length === 0) return;

    if (this.backend === 'near') {
      const client = await this.ensureNearClient();
      const chatId = messages[0].chatId;

      // Get existing conversation
      const conversation = await client.getConversation(chatId);

      if (conversation) {
        // Append new messages
        const nearMessages = messages.map((msg) => ({
          role: msg.role,
          content: JSON.stringify(msg.parts),
          timestamp: msg.createdAt.getTime() * 1_000_000,
          id: msg.id,
          attachments: msg.attachments
            ? JSON.stringify(msg.attachments)
            : undefined,
        }));

        await client.appendMessages(chatId, nearMessages);
      } else {
        // Create new conversation with these messages
        const nearMessages = messages.map((msg) => ({
          role: msg.role,
          content: JSON.stringify(msg.parts),
          timestamp: msg.createdAt.getTime() * 1_000_000,
          id: msg.id,
          attachments: msg.attachments
            ? JSON.stringify(msg.attachments)
            : undefined,
        }));

        await client.saveConversation(chatId, nearMessages, 'New Chat', 'private');
      }
    } else {
      // Save to PostgreSQL
      await pgQueries.saveMessages({ messages });
    }
  }

  /**
   * Get messages by chat ID
   */
  async getMessagesByChatId(chatId: string): Promise<DBMessage[]> {
    if (this.backend === 'near') {
      const client = await this.ensureNearClient();
      const conversation = await client.getConversation(chatId);

      if (!conversation) return [];

      // Convert NEAR messages to DBMessage format
      return conversation.messages.map((msg) => ({
        id: msg.id || `msg_${Date.now()}`,
        chatId,
        role: msg.role,
        parts: JSON.parse(msg.content),
        attachments: msg.attachments ? JSON.parse(msg.attachments) : [],
        createdAt: new Date(msg.timestamp / 1_000_000),
      }));
    } else {
      return await pgQueries.getMessagesByChatId({ id: chatId });
    }
  }

  // ============= DOCUMENT OPERATIONS =============

  /**
   * Save document (artifacts only in PostgreSQL for now)
   */
  async saveDocument(params: {
    id: string;
    title: string;
    kind: ArtifactKind;
    content?: string;
  }): Promise<void> {
    // Documents always stored in PostgreSQL
    // TODO: Consider NEAR storage for documents in future
    await pgQueries.saveDocument({
      ...params,
      userId: this.userId,
    });
  }

  /**
   * Get documents by user ID
   */
  async getDocumentsByUserId(): Promise<any[]> {
    // Documents always from PostgreSQL
    return await pgQueries.getDocumentsByUserId({ userId: this.userId });
  }

  /**
   * Get document by ID
   */
  async getDocumentById(id: string): Promise<any | null> {
    // Documents always from PostgreSQL
    return await pgQueries.getDocumentById({ id });
  }

  // ============= MIGRATION UTILITIES =============

  /**
   * Migrate conversation from PostgreSQL to NEAR
   */
  async migrateConversationToNear(chatId: string): Promise<void> {
    if (!this.nearAccountId) {
      throw new Error('NEAR account required for migration');
    }

    // Get data from PostgreSQL
    const chat = await pgQueries.getChatById({ id: chatId });
    if (!chat) throw new Error('Chat not found');

    const messages = await pgQueries.getMessagesByChatId({ id: chatId });

    // Save to NEAR
    const client = await this.ensureNearClient();
    const nearMessages = messages.map((msg) => ({
      role: msg.role,
      content: JSON.stringify(msg.parts),
      timestamp: msg.createdAt.getTime() * 1_000_000,
      id: msg.id,
      attachments: msg.attachments ? JSON.stringify(msg.attachments) : undefined,
    }));

    await client.saveConversation(
      chatId,
      nearMessages,
      chat.title,
      chat.visibility
    );

    console.log(`Migrated conversation ${chatId} to NEAR`);
  }

  /**
   * Migrate conversation from NEAR to PostgreSQL
   */
  async migrateConversationToPostgres(chatId: string): Promise<void> {
    // Get data from NEAR
    const client = await this.ensureNearClient();
    const conversation = await client.getConversation(chatId);

    if (!conversation) throw new Error('Conversation not found on NEAR');

    // Save chat to PostgreSQL
    await pgQueries.saveChat({
      id: chatId,
      userId: this.userId,
      title: conversation.title,
      visibility: conversation.visibility as VisibilityType,
    });

    // Save messages to PostgreSQL
    const messages: HybridMessage[] = conversation.messages.map((msg) => ({
      id: msg.id || `msg_${Date.now()}`,
      chatId,
      role: msg.role,
      parts: JSON.parse(msg.content),
      attachments: msg.attachments ? JSON.parse(msg.attachments) : [],
      createdAt: new Date(msg.timestamp / 1_000_000),
    }));

    await pgQueries.saveMessages({ messages });

    console.log(`Migrated conversation ${chatId} to PostgreSQL`);
  }

  /**
   * Migrate all conversations to NEAR
   */
  async migrateAllToNear(): Promise<void> {
    const chats = await pgQueries.getChatsByUserId({ id: this.userId });

    for (const chat of chats) {
      try {
        await this.migrateConversationToNear(chat.id);
      } catch (error) {
        console.error(`Failed to migrate chat ${chat.id}:`, error);
      }
    }

    console.log(`Migrated ${chats.length} conversations to NEAR`);
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    backend: StorageBackend;
    conversationCount: number;
    storageUsed?: number;
  }> {
    if (this.backend === 'near') {
      const client = await this.ensureNearClient();
      const stats = await client.getStorageStats();

      return {
        backend: 'near',
        conversationCount: stats.total_conversations,
        storageUsed: stats.storage_used_bytes,
      };
    } else {
      const chats = await pgQueries.getChatsByUserId({ id: this.userId });

      return {
        backend: 'postgres',
        conversationCount: chats.length,
      };
    }
  }
}

/**
 * Create hybrid storage client for a user
 */
export async function createHybridStorage(
  user: Pick<User, 'id' | 'nearAccountId'>,
  preferredBackend?: StorageBackend
): Promise<HybridStorage> {
  // Determine backend: use NEAR if user has account and prefers it
  const backend: StorageBackend =
    preferredBackend || (user.nearAccountId ? 'near' : 'postgres');

  return new HybridStorage(user.id, backend, user.nearAccountId);
}
