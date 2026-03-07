use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LookupMap, UnorderedMap};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near, AccountId, BorshStorageKey, PanicOnDefault};

/// Storage keys for different collections
#[derive(BorshStorageKey, BorshSerialize)]
pub enum StorageKey {
    Conversations,
    Profile,
}

/// Represents a single message in a conversation
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct Message {
    /// Role: 'user', 'assistant', 'system', or 'tool'
    pub role: String,

    /// Message content (can be encrypted JSON)
    pub content: String,

    /// Timestamp in nanoseconds
    pub timestamp: u64,

    /// Optional message ID
    pub id: Option<String>,

    /// Optional attachments metadata
    pub attachments: Option<String>,
}

/// Represents a conversation thread
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct Conversation {
    /// Unique conversation ID
    pub id: String,

    /// Conversation title
    pub title: String,

    /// Array of messages
    pub messages: Vec<Message>,

    /// Created timestamp (nanoseconds)
    pub created_at: u64,

    /// Last updated timestamp (nanoseconds)
    pub updated_at: u64,

    /// Visibility: 'public' or 'private'
    pub visibility: String,
}

/// Represents a single item in the shopping cart
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct CartItem {
    /// Product ID
    pub product_id: String,

    /// Quantity
    pub quantity: u32,

    /// Merchant name
    pub merchant_name: String,

    /// Optional product title
    pub title: Option<String>,

    /// Optional price in cents
    pub price: Option<u64>,

    /// Optional image URL
    pub image_url: Option<String>,
}

/// Represents the user's shopping cart
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct ShoppingCart {
    /// Array of cart items
    pub items: Vec<CartItem>,

    /// Merchant URL
    pub merchant_url: String,

    /// Last updated timestamp (nanoseconds)
    pub updated_at: u64,
}

/// Main contract structure
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AiMemory {
    /// Owner of this memory contract (NEAR account)
    owner: AccountId,

    /// Conversations storage: chatId -> Conversation
    conversations: UnorderedMap<String, Conversation>,

    /// Profile/preferences storage: key -> encrypted value
    profile: LookupMap<String, String>,

    /// Shopping cart
    cart: Option<ShoppingCart>,
}

#[near]
impl AiMemory {
    /// Initialize the contract
    #[init]
    pub fn new(owner: AccountId) -> Self {
        assert!(!env::state_exists(), "Already initialized");
        Self {
            owner,
            conversations: UnorderedMap::new(StorageKey::Conversations),
            profile: LookupMap::new(StorageKey::Profile),
            cart: None,
        }
    }

    /// Get the contract owner
    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    // ============= CONVERSATION MANAGEMENT =============

    /// Save or update a conversation
    pub fn save_conversation(&mut self, chat_id: String, conversation: Conversation) {
        self.assert_owner();
        self.conversations.insert(&chat_id, &conversation);
    }

    /// Get a specific conversation by ID
    pub fn get_conversation(&self, chat_id: String) -> Option<Conversation> {
        self.conversations.get(&chat_id)
    }

    /// List conversations with pagination
    pub fn list_conversations(&self, from_index: u64, limit: u64) -> Vec<(String, Conversation)> {
        self.conversations
            .iter()
            .skip(from_index as usize)
            .take(limit as usize)
            .collect()
    }

    /// Get total number of conversations
    pub fn get_conversations_count(&self) -> u64 {
        self.conversations.len()
    }

    /// Delete a conversation
    pub fn delete_conversation(&mut self, chat_id: String) {
        self.assert_owner();
        self.conversations.remove(&chat_id);
    }

    /// Append messages to an existing conversation
    pub fn append_messages(&mut self, chat_id: String, messages: Vec<Message>) {
        self.assert_owner();

        if let Some(mut conversation) = self.conversations.get(&chat_id) {
            conversation.messages.extend(messages);
            conversation.updated_at = env::block_timestamp();
            self.conversations.insert(&chat_id, &conversation);
        } else {
            env::panic_str("Conversation not found");
        }
    }

    // ============= SHOPPING CART MANAGEMENT =============

    /// Save or update the shopping cart
    pub fn save_cart(&mut self, cart: ShoppingCart) {
        self.assert_owner();
        self.cart = Some(cart);
    }

    /// Get the current shopping cart
    pub fn get_cart(&self) -> Option<ShoppingCart> {
        self.cart.clone()
    }

    /// Clear the shopping cart
    pub fn clear_cart(&mut self) {
        self.assert_owner();
        self.cart = None;
    }

    /// Add an item to the cart
    pub fn add_cart_item(&mut self, item: CartItem) {
        self.assert_owner();

        if let Some(ref mut cart) = self.cart {
            // Check if item already exists, update quantity if so
            if let Some(existing_item) = cart.items.iter_mut()
                .find(|i| i.product_id == item.product_id) {
                existing_item.quantity += item.quantity;
            } else {
                cart.items.push(item);
            }
            cart.updated_at = env::block_timestamp();
        } else {
            // Create new cart with this item
            self.cart = Some(ShoppingCart {
                items: vec![item],
                merchant_url: String::new(),
                updated_at: env::block_timestamp(),
            });
        }
    }

    /// Remove an item from the cart
    pub fn remove_cart_item(&mut self, product_id: String) {
        self.assert_owner();

        if let Some(ref mut cart) = self.cart {
            cart.items.retain(|item| item.product_id != product_id);
            cart.updated_at = env::block_timestamp();

            // If cart is empty, clear it
            if cart.items.is_empty() {
                self.cart = None;
            }
        }
    }

    /// Update cart item quantity
    pub fn update_cart_item_quantity(&mut self, product_id: String, quantity: u32) {
        self.assert_owner();

        if let Some(ref mut cart) = self.cart {
            if let Some(item) = cart.items.iter_mut()
                .find(|i| i.product_id == product_id) {
                if quantity == 0 {
                    // Remove item if quantity is 0
                    cart.items.retain(|i| i.product_id != product_id);
                } else {
                    item.quantity = quantity;
                }
                cart.updated_at = env::block_timestamp();
            }
        }
    }

    // ============= PROFILE & PREFERENCES =============

    /// Set a profile field (encrypted value)
    pub fn set_profile_field(&mut self, key: String, encrypted_value: String) {
        self.assert_owner();
        self.profile.insert(&key, &encrypted_value);
    }

    /// Get a profile field
    pub fn get_profile_field(&self, key: String) -> Option<String> {
        self.profile.get(&key)
    }

    /// Delete a profile field
    pub fn delete_profile_field(&mut self, key: String) {
        self.assert_owner();
        self.profile.remove(&key);
    }

    // ============= AI CONTEXT / MEMORY =============

    /// Update AI context (long-term memory)
    pub fn update_ai_context(&mut self, encrypted_context: String) {
        self.assert_owner();
        self.profile.insert(&"ai_context".to_string(), &encrypted_context);
    }

    /// Get AI context
    pub fn get_ai_context(&self) -> Option<String> {
        self.profile.get(&"ai_context".to_string())
    }

    /// Set user preferences
    pub fn set_preferences(&mut self, encrypted_preferences: String) {
        self.assert_owner();
        self.profile.insert(&"preferences".to_string(), &encrypted_preferences);
    }

    /// Get user preferences
    pub fn get_preferences(&self) -> Option<String> {
        self.profile.get(&"preferences".to_string())
    }

    // ============= HELPER METHODS =============

    /// Assert that the caller is the owner
    fn assert_owner(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Only the owner can perform this action"
        );
    }

    /// Get contract storage usage stats
    pub fn get_storage_stats(&self) -> StorageStats {
        StorageStats {
            total_conversations: self.conversations.len(),
            storage_used_bytes: env::storage_usage(),
            owner: self.owner.clone(),
        }
    }
}

/// Storage statistics structure
#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct StorageStats {
    pub total_conversations: u64,
    pub storage_used_bytes: u64,
    pub owner: AccountId,
}

// ============= UNIT TESTS =============

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn get_context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder
    }

    #[test]
    fn test_initialization() {
        let context = get_context(accounts(1));
        testing_env!(context.build());

        let contract = AiMemory::new(accounts(1));
        assert_eq!(contract.get_owner(), accounts(1));
        assert_eq!(contract.get_conversations_count(), 0);
    }

    #[test]
    fn test_save_and_get_conversation() {
        let mut context = get_context(accounts(1));
        testing_env!(context.build());

        let mut contract = AiMemory::new(accounts(1));

        let message = Message {
            role: "user".to_string(),
            content: "Hello, AI!".to_string(),
            timestamp: 1234567890,
            id: Some("msg_1".to_string()),
            attachments: None,
        };

        let conversation = Conversation {
            id: "chat_1".to_string(),
            title: "Test Chat".to_string(),
            messages: vec![message],
            created_at: 1234567890,
            updated_at: 1234567890,
            visibility: "private".to_string(),
        };

        contract.save_conversation("chat_1".to_string(), conversation.clone());

        let retrieved = contract.get_conversation("chat_1".to_string());
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().title, "Test Chat");
    }

    #[test]
    fn test_cart_operations() {
        let mut context = get_context(accounts(1));
        testing_env!(context.build());

        let mut contract = AiMemory::new(accounts(1));

        // Add item to cart
        let item = CartItem {
            product_id: "prod_1".to_string(),
            quantity: 2,
            merchant_name: "Test Merchant".to_string(),
            title: Some("Product 1".to_string()),
            price: Some(1999),
            image_url: None,
        };

        contract.add_cart_item(item.clone());

        let cart = contract.get_cart();
        assert!(cart.is_some());
        assert_eq!(cart.unwrap().items.len(), 1);

        // Update quantity
        contract.update_cart_item_quantity("prod_1".to_string(), 5);
        let cart = contract.get_cart().unwrap();
        assert_eq!(cart.items[0].quantity, 5);

        // Remove item
        contract.remove_cart_item("prod_1".to_string());
        assert!(contract.get_cart().is_none());
    }

    #[test]
    fn test_profile_fields() {
        let mut context = get_context(accounts(1));
        testing_env!(context.build());

        let mut contract = AiMemory::new(accounts(1));

        contract.set_profile_field(
            "language".to_string(),
            "encrypted_english".to_string(),
        );

        let value = contract.get_profile_field("language".to_string());
        assert_eq!(value, Some("encrypted_english".to_string()));
    }

    #[test]
    #[should_panic(expected = "Only the owner can perform this action")]
    fn test_unauthorized_access() {
        let mut context = get_context(accounts(1));
        testing_env!(context.build());

        let mut contract = AiMemory::new(accounts(1));

        // Switch to different account
        context.predecessor_account_id(accounts(2));
        testing_env!(context.build());

        // This should panic
        contract.clear_cart();
    }

    #[test]
    fn test_list_conversations() {
        let mut context = get_context(accounts(1));
        testing_env!(context.build());

        let mut contract = AiMemory::new(accounts(1));

        // Add multiple conversations
        for i in 0..5 {
            let conv = Conversation {
                id: format!("chat_{}", i),
                title: format!("Chat {}", i),
                messages: vec![],
                created_at: 1234567890 + i,
                updated_at: 1234567890 + i,
                visibility: "private".to_string(),
            };
            contract.save_conversation(format!("chat_{}", i), conv);
        }

        let conversations = contract.list_conversations(0, 3);
        assert_eq!(conversations.len(), 3);

        let conversations = contract.list_conversations(3, 3);
        assert_eq!(conversations.len(), 2);
    }
}
