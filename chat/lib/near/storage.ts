import { connect, keyStores, Contract, Account } from 'near-api-js';
import type { AccountView } from 'near-api-js/lib/providers/provider';
import {
  encrypt,
  decrypt,
  encryptString,
  decryptString,
  type EncryptedData,
} from './encryption';

// NEAR network configuration
const NEAR_NETWORK = process.env.NEXT_PUBLIC_NEAR_NETWORK || 'testnet';
const NEAR_NODE_URL =
  NEAR_NETWORK === 'mainnet'
    ? 'https://rpc.mainnet.near.org'
    : 'https://rpc.testnet.near.org';

// Contract suffix for AI memory
const CONTRACT_SUFFIX = '.ai-memory';

// Type definitions matching the smart contract
export interface Message {
  role: string;
  content: string;
  timestamp: number;
  id?: string;
  attachments?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  created_at: number;
  updated_at: number;
  visibility: string;
}

export interface CartItem {
  product_id: string;
  quantity: number;
  merchant_name: string;
  title?: string;
  price?: number;
  image_url?: string;
}

export interface ShoppingCart {
  items: CartItem[];
  merchant_url: string;
  updated_at: number;
}

export interface StorageStats {
  total_conversations: number;
  storage_used_bytes: number;
  owner: string;
}

/**
 * Client for interacting with NEAR AI Memory smart contract
 */
export class NearMemoryClient {
  private account: Account | null = null;
  private contract: any = null;
  private contractId: string = '';
  private accountId: string = '';

  /**
   * Initialize the NEAR connection and contract
   * @param accountId - NEAR account ID (e.g., "alice.testnet")
   */
  async init(accountId: string): Promise<void> {
    this.accountId = accountId;

    // Connect to NEAR
    const near = await connect({
      networkId: NEAR_NETWORK,
      keyStore: new keyStores.BrowserLocalStorageKeyStore(),
      nodeUrl: NEAR_NODE_URL,
      headers: {},
    });

    this.account = await near.account(accountId);

    // Construct contract account ID
    // For subaccount pattern: alice.testnet -> ai-memory.alice.testnet
    const parts = accountId.split('.');
    if (parts.length >= 2) {
      // testnet/mainnet account
      const base = parts.slice(0, -1).join('.');
      const tld = parts[parts.length - 1];
      this.contractId = `ai-memory.${base}.${tld}`;
    } else {
      // Local/custom account
      this.contractId = `ai-memory.${accountId}`;
    }

    // Initialize contract interface
    this.contract = new Contract(this.account, this.contractId, {
      viewMethods: [
        'get_conversation',
        'list_conversations',
        'get_conversations_count',
        'get_cart',
        'get_profile_field',
        'get_ai_context',
        'get_preferences',
        'get_storage_stats',
        'get_owner',
      ],
      changeMethods: [
        'save_conversation',
        'delete_conversation',
        'append_messages',
        'save_cart',
        'clear_cart',
        'add_cart_item',
        'remove_cart_item',
        'update_cart_item_quantity',
        'set_profile_field',
        'delete_profile_field',
        'update_ai_context',
        'set_preferences',
      ],
    });
  }

  /**
   * Check if contract exists, deploy if necessary
   */
  async ensureContractDeployed(): Promise<boolean> {
    try {
      const account = await this.getContractAccountInfo();
      return account !== null;
    } catch (error) {
      console.warn('Contract not deployed:', error);
      return false;
    }
  }

  /**
   * Get contract account info
   */
  async getContractAccountInfo(): Promise<AccountView | null> {
    try {
      const response = await fetch(NEAR_NODE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'contract-info',
          method: 'query',
          params: {
            request_type: 'view_account',
            finality: 'final',
            account_id: this.contractId,
          },
        }),
      });

      const data = await response.json();
      return data.error ? null : data.result;
    } catch (error) {
      console.error('Failed to get contract info:', error);
      return null;
    }
  }

  // ============= CONVERSATION MANAGEMENT =============

  /**
   * Save or update a conversation
   */
  async saveConversation(
    chatId: string,
    messages: Message[],
    title: string,
    visibility: 'public' | 'private' = 'private'
  ): Promise<void> {
    if (!this.contract) throw new Error('Contract not initialized');

    // Encrypt messages before saving
    const encryptedMessages = await this.encryptMessages(messages);

    const conversation: Conversation = {
      id: chatId,
      title,
      messages: encryptedMessages,
      created_at: Date.now() * 1_000_000, // Convert to nanoseconds
      updated_at: Date.now() * 1_000_000,
      visibility,
    };

    await this.contract.save_conversation({
      args: { chat_id: chatId, conversation },
      gas: '30000000000000', // 30 TGas
    });
  }

  /**
   * Get a conversation by ID
   */
  async getConversation(chatId: string): Promise<Conversation | null> {
    if (!this.contract) throw new Error('Contract not initialized');

    const conversation = await this.contract.get_conversation({
      chat_id: chatId,
    });

    if (!conversation) return null;

    // Decrypt messages
    conversation.messages = await this.decryptMessages(conversation.messages);
    return conversation;
  }

  /**
   * List conversations with pagination
   */
  async listConversations(
    fromIndex: number = 0,
    limit: number = 20
  ): Promise<Array<{ chatId: string; conversation: Conversation }>> {
    if (!this.contract) throw new Error('Contract not initialized');

    const conversations = await this.contract.list_conversations({
      from_index: fromIndex,
      limit,
    });

    // Decrypt all conversations
    return Promise.all(
      conversations.map(async ([chatId, conv]: [string, Conversation]) => ({
        chatId,
        conversation: {
          ...conv,
          messages: await this.decryptMessages(conv.messages),
        },
      }))
    );
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(chatId: string): Promise<void> {
    if (!this.contract) throw new Error('Contract not initialized');

    await this.contract.delete_conversation({
      args: { chat_id: chatId },
      gas: '30000000000000',
    });
  }

  /**
   * Append messages to existing conversation
   */
  async appendMessages(chatId: string, messages: Message[]): Promise<void> {
    if (!this.contract) throw new Error('Contract not initialized');

    const encryptedMessages = await this.encryptMessages(messages);

    await this.contract.append_messages({
      args: { chat_id: chatId, messages: encryptedMessages },
      gas: '30000000000000',
    });
  }

  // ============= SHOPPING CART MANAGEMENT =============

  /**
   * Save shopping cart
   */
  async saveCart(items: CartItem[], merchantUrl: string): Promise<void> {
    if (!this.contract) throw new Error('Contract not initialized');

    const cart: ShoppingCart = {
      items,
      merchant_url: merchantUrl,
      updated_at: Date.now() * 1_000_000,
    };

    await this.contract.save_cart({
      args: { cart },
      gas: '30000000000000',
    });
  }

  /**
   * Get current shopping cart
   */
  async getCart(): Promise<ShoppingCart | null> {
    if (!this.contract) throw new Error('Contract not initialized');
    return await this.contract.get_cart();
  }

  /**
   * Clear shopping cart
   */
  async clearCart(): Promise<void> {
    if (!this.contract) throw new Error('Contract not initialized');

    await this.contract.clear_cart({
      gas: '30000000000000',
    });
  }

  /**
   * Add item to cart
   */
  async addCartItem(item: CartItem): Promise<void> {
    if (!this.contract) throw new Error('Contract not initialized');

    await this.contract.add_cart_item({
      args: { item },
      gas: '30000000000000',
    });
  }

  /**
   * Remove item from cart
   */
  async removeCartItem(productId: string): Promise<void> {
    if (!this.contract) throw new Error('Contract not initialized');

    await this.contract.remove_cart_item({
      args: { product_id: productId },
      gas: '30000000000000',
    });
  }

  /**
   * Update cart item quantity
   */
  async updateCartItemQuantity(
    productId: string,
    quantity: number
  ): Promise<void> {
    if (!this.contract) throw new Error('Contract not initialized');

    await this.contract.update_cart_item_quantity({
      args: { product_id: productId, quantity },
      gas: '30000000000000',
    });
  }

  // ============= PROFILE & AI CONTEXT =============

  /**
   * Set profile field (encrypted)
   */
  async setProfileField(key: string, value: any): Promise<void> {
    if (!this.contract) throw new Error('Contract not initialized');

    const encrypted = await this.encryptData(JSON.stringify(value));

    await this.contract.set_profile_field({
      args: { key, encrypted_value: encrypted },
      gas: '30000000000000',
    });
  }

  /**
   * Get profile field
   */
  async getProfileField(key: string): Promise<any> {
    if (!this.contract) throw new Error('Contract not initialized');

    const encrypted = await this.contract.get_profile_field({ key });
    if (!encrypted) return null;

    const decrypted = await this.decryptData(encrypted);
    return JSON.parse(decrypted);
  }

  /**
   * Update AI context
   */
  async updateAiContext(context: any): Promise<void> {
    if (!this.contract) throw new Error('Contract not initialized');

    const encrypted = await this.encryptData(JSON.stringify(context));

    await this.contract.update_ai_context({
      args: { encrypted_context: encrypted },
      gas: '30000000000000',
    });
  }

  /**
   * Get AI context
   */
  async getAiContext(): Promise<any> {
    if (!this.contract) throw new Error('Contract not initialized');

    const encrypted = await this.contract.get_ai_context();
    if (!encrypted) return null;

    const decrypted = await this.decryptData(encrypted);
    return JSON.parse(decrypted);
  }

  /**
   * Get storage stats
   */
  async getStorageStats(): Promise<StorageStats> {
    if (!this.contract) throw new Error('Contract not initialized');
    return await this.contract.get_storage_stats();
  }

  // ============= ENCRYPTION UTILITIES =============

  /**
   * Encrypt messages using Web Crypto API
   */
  private async encryptMessages(messages: Message[]): Promise<Message[]> {
    return Promise.all(
      messages.map(async (msg) => ({
        ...msg,
        content: await encryptString(msg.content, this.accountId),
        attachments: msg.attachments
          ? await encryptString(msg.attachments, this.accountId)
          : undefined,
      }))
    );
  }

  /**
   * Decrypt messages using Web Crypto API
   */
  private async decryptMessages(messages: Message[]): Promise<Message[]> {
    return Promise.all(
      messages.map(async (msg) => ({
        ...msg,
        content: await decryptString(msg.content, this.accountId),
        attachments: msg.attachments
          ? await decryptString(msg.attachments, this.accountId)
          : undefined,
      }))
    );
  }

  /**
   * Encrypt data for storage
   */
  private async encryptData(data: string): Promise<string> {
    return await encryptString(data, this.accountId);
  }

  /**
   * Decrypt data from storage
   */
  private async decryptData(encrypted: string): Promise<string> {
    return await decryptString(encrypted, this.accountId);
  }

  /**
   * Get contract ID
   */
  getContractId(): string {
    return this.contractId;
  }
}

/**
 * Create and initialize a NEAR memory client
 */
export async function createNearMemoryClient(
  accountId: string
): Promise<NearMemoryClient> {
  const client = new NearMemoryClient();
  await client.init(accountId);
  return client;
}
