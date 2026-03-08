import { NearBindgen, near, call, view, initialize, LookupMap, UnorderedMap } from 'near-sdk-js';

/**
 * Multi-User AI Memory Contract
 *
 * Stores per-user data:
 * - Shopping carts
 * - Conversations
 * - Profile/preferences
 */
@NearBindgen({})
class AiMemory {
  constructor() {
    this.owner = '';
    this.userCarts = new LookupMap('carts');
    this.userConversations = new UnorderedMap('convos');
    this.userProfiles = new LookupMap('profiles');
  }

  @initialize({})
  init({ owner }) {
    this.owner = owner;
    this.userCarts = new LookupMap('carts');
    this.userConversations = new UnorderedMap('convos');
    this.userProfiles = new LookupMap('profiles');
  }

  // ============= SHOPPING CART MANAGEMENT =============

  @call({})
  save_cart({ cart }) {
    const user = near.predecessorAccountId();
    this.userCarts.set(user, cart);
  }

  @view({})
  get_cart({ account_id }) {
    // If account_id not provided, use signer (for view calls)
    const user = account_id || near.signerAccountId();
    return this.userCarts.get(user) || null;
  }

  @call({})
  clear_cart() {
    const user = near.predecessorAccountId();
    this.userCarts.remove(user);
  }

  @call({})
  add_cart_item({ item }) {
    const user = near.predecessorAccountId();
    let cart = this.userCarts.get(user);

    if (cart) {
      // Check if item already exists
      const existingIndex = cart.items.findIndex(i => i.product_id === item.product_id);

      if (existingIndex >= 0) {
        // Update quantity
        cart.items[existingIndex].quantity += item.quantity;
      } else {
        // Add new item
        cart.items.push(item);
      }
      cart.updated_at = near.blockTimestamp();
    } else {
      // Create new cart
      cart = {
        items: [item],
        merchant_url: '',
        updated_at: near.blockTimestamp()
      };
    }

    this.userCarts.set(user, cart);
  }

  @call({})
  remove_cart_item({ product_id }) {
    const user = near.predecessorAccountId();
    let cart = this.userCarts.get(user);

    if (cart) {
      cart.items = cart.items.filter(item => item.product_id !== product_id);
      cart.updated_at = near.blockTimestamp();

      if (cart.items.length === 0) {
        this.userCarts.remove(user);
      } else {
        this.userCarts.set(user, cart);
      }
    }
  }

  @call({})
  update_cart_item_quantity({ product_id, quantity }) {
    const user = near.predecessorAccountId();
    let cart = this.userCarts.get(user);

    if (cart) {
      const itemIndex = cart.items.findIndex(i => i.product_id === product_id);

      if (itemIndex >= 0) {
        if (quantity === 0) {
          cart.items.splice(itemIndex, 1);
        } else {
          cart.items[itemIndex].quantity = quantity;
        }
        cart.updated_at = near.blockTimestamp();

        if (cart.items.length === 0) {
          this.userCarts.remove(user);
        } else {
          this.userCarts.set(user, cart);
        }
      }
    }
  }

  // ============= CONVERSATION MANAGEMENT =============

  @call({})
  save_conversation({ chat_id, conversation }) {
    const user = near.predecessorAccountId();
    const key = `${user}::${chat_id}`;
    this.userConversations.set(key, conversation);
  }

  @view({})
  get_conversation({ chat_id, account_id }) {
    const user = account_id || near.signerAccountId();
    const key = `${user}::${chat_id}`;
    return this.userConversations.get(key) || null;
  }

  @call({})
  delete_conversation({ chat_id }) {
    const user = near.predecessorAccountId();
    const key = `${user}::${chat_id}`;
    this.userConversations.remove(key);
  }

  @call({})
  append_messages({ chat_id, messages }) {
    const user = near.predecessorAccountId();
    const key = `${user}::${chat_id}`;
    let conversation = this.userConversations.get(key);

    if (conversation) {
      conversation.messages.push(...messages);
      conversation.updated_at = near.blockTimestamp();
      this.userConversations.set(key, conversation);
    } else {
      throw new Error('Conversation not found');
    }
  }

  @view({})
  list_conversations({ from_index = 0, limit = 10, account_id }) {
    const user = account_id || near.signerAccountId();
    const prefix = `${user}::`;
    const conversations = [];

    for (let i = from_index; i < from_index + limit; i++) {
      const keys = this.userConversations.keys({ start: i, limit: 1 });
      if (keys.length === 0) break;

      const key = keys[0];
      if (key.startsWith(prefix)) {
        const chat_id = key.substring(prefix.length);
        const conversation = this.userConversations.get(key);
        conversations.push({ chat_id, conversation });
      }
    }

    return conversations;
  }

  @view({})
  get_conversations_count({ account_id }) {
    const user = account_id || near.signerAccountId();
    const prefix = `${user}::`;
    let count = 0;

    // Iterate through all keys and count user's conversations
    const allKeys = this.userConversations.toArray();
    for (const [key, _] of allKeys) {
      if (key.startsWith(prefix)) {
        count++;
      }
    }

    return count;
  }

  // ============= PROFILE & PREFERENCES =============

  @call({})
  set_profile_field({ key, encrypted_value }) {
    const user = near.predecessorAccountId();
    const fullKey = `${user}::${key}`;
    this.userProfiles.set(fullKey, encrypted_value);
  }

  @view({})
  get_profile_field({ key, account_id }) {
    const user = account_id || near.signerAccountId();
    const fullKey = `${user}::${key}`;
    return this.userProfiles.get(fullKey) || null;
  }

  @call({})
  delete_profile_field({ key }) {
    const user = near.predecessorAccountId();
    const fullKey = `${user}::${key}`;
    this.userProfiles.remove(fullKey);
  }

  @call({})
  update_ai_context({ encrypted_context }) {
    const user = near.predecessorAccountId();
    const fullKey = `${user}::ai_context`;
    this.userProfiles.set(fullKey, encrypted_context);
  }

  @view({})
  get_ai_context({ account_id }) {
    const user = account_id || near.signerAccountId();
    const fullKey = `${user}::ai_context`;
    return this.userProfiles.get(fullKey) || null;
  }

  @call({})
  set_preferences({ encrypted_preferences }) {
    const user = near.predecessorAccountId();
    const fullKey = `${user}::preferences`;
    this.userProfiles.set(fullKey, encrypted_preferences);
  }

  @view({})
  get_preferences({ account_id }) {
    const user = account_id || near.signerAccountId();
    const fullKey = `${user}::preferences`;
    return this.userProfiles.get(fullKey) || null;
  }

  // ============= UTILITY METHODS =============

  @view({})
  get_owner() {
    return this.owner;
  }

  @view({})
  get_storage_stats() {
    return {
      storage_used_bytes: near.storageUsage(),
      owner: this.owner
    };
  }
}
