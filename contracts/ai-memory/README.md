# AI Memory Smart Contract

A NEAR Protocol smart contract for storing user AI interaction data, conversations, shopping cart, and preferences with client-side encryption.

## Features

- 💬 **Conversation Storage**: Store encrypted chat history with full CRUD operations
- 🛒 **Persistent Shopping Cart**: Never lose your cart across sessions
- 👤 **User Profile & Preferences**: Store encrypted user settings
- 🧠 **AI Context Memory**: Long-term AI memory storage
- 🔒 **Owner-Only Access**: All data is private to the account owner
- 📊 **Storage Stats**: Monitor contract storage usage

## Contract Methods

### Conversation Management

```rust
// Save a conversation
pub fn save_conversation(&mut self, chat_id: String, conversation: Conversation)

// Get a conversation
pub fn get_conversation(&self, chat_id: String) -> Option<Conversation>

// List conversations with pagination
pub fn list_conversations(&self, from_index: u64, limit: u64) -> Vec<(String, Conversation)>

// Delete a conversation
pub fn delete_conversation(&mut self, chat_id: String)

// Append messages to existing conversation
pub fn append_messages(&mut self, chat_id: String, messages: Vec<Message>)
```

### Shopping Cart

```rust
// Save entire cart
pub fn save_cart(&mut self, cart: ShoppingCart)

// Get current cart
pub fn get_cart(&self) -> Option<ShoppingCart>

// Clear cart
pub fn clear_cart(&mut self)

// Add item to cart
pub fn add_cart_item(&mut self, item: CartItem)

// Remove item from cart
pub fn remove_cart_item(&mut self, product_id: String)

// Update item quantity
pub fn update_cart_item_quantity(&mut self, product_id: String, quantity: u32)
```

### Profile & AI Context

```rust
// Set profile field (encrypted)
pub fn set_profile_field(&mut self, key: String, encrypted_value: String)

// Get profile field
pub fn get_profile_field(&self, key: String) -> Option<String>

// Update AI context
pub fn update_ai_context(&mut self, encrypted_context: String)

// Get AI context
pub fn get_ai_context(&self) -> Option<String>

// Set/Get preferences
pub fn set_preferences(&mut self, encrypted_preferences: String)
pub fn get_preferences(&self) -> Option<String>
```

## Data Structures

### Message
```rust
{
  role: String,        // 'user', 'assistant', 'system', 'tool'
  content: String,     // Encrypted message content
  timestamp: u64,      // Nanosecond timestamp
  id: Option<String>,  // Optional message ID
  attachments: Option<String> // Optional metadata
}
```

### Conversation
```rust
{
  id: String,
  title: String,
  messages: Vec<Message>,
  created_at: u64,
  updated_at: u64,
  visibility: String   // 'public' or 'private'
}
```

### CartItem
```rust
{
  product_id: String,
  quantity: u32,
  merchant_name: String,
  title: Option<String>,
  price: Option<u64>,
  image_url: Option<String>
}
```

### ShoppingCart
```rust
{
  items: Vec<CartItem>,
  merchant_url: String,
  updated_at: u64
}
```

## Building

### Prerequisites

1. Install Rust:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

2. Add WASM target:
```bash
rustup target add wasm32-unknown-unknown
```

3. Install NEAR CLI:
```bash
npm install -g near-cli-rs
```

### Build the Contract

```bash
cd contracts/ai-memory
chmod +x build.sh
./build.sh
```

Output: `out/ai_memory.wasm` (optimized for deployment)

## Testing

Run unit tests:
```bash
chmod +x test.sh
./test.sh
```

Or directly with cargo:
```bash
cargo test
```

## Deployment

### Deploy to Testnet

1. Create a testnet account at https://testnet.mynearwallet.com/

2. Deploy the contract:
```bash
chmod +x deploy.sh
./deploy.sh your-account.testnet testnet
```

### Deploy to Mainnet

1. Ensure you have a mainnet account with sufficient NEAR for storage

2. Deploy:
```bash
./deploy.sh your-account.near mainnet
```

### Deploy as Subaccount (Recommended)

For per-user deployments, deploy to a subaccount:

```bash
# Create subaccount
near account create-account fund-myself ai-memory.your-account.testnet '1 NEAR' autogenerate-new-keypair save-to-keychain sign-as your-account.testnet network-config testnet sign-with-keychain send

# Deploy to subaccount
./deploy.sh ai-memory.your-account.testnet testnet
```

## Storage Costs

NEAR charges for storage:
- 1 byte ≈ 0.00001 NEAR (10^-5 NEAR)
- 100 KB ≈ 1 NEAR

**Typical Usage:**
- 1 conversation (10 messages): ~5 KB = 0.05 NEAR
- 100 conversations: ~500 KB = 5 NEAR
- Shopping cart: ~1 KB = 0.01 NEAR

**Storage Staking:**
When you deploy, NEAR locks an amount proportional to storage used. You get it back when data is deleted.

## Usage Examples

### Save a Conversation (NEAR CLI)

```bash
near contract call-function as-transaction ai-memory.testnet save_conversation json-args '{"chat_id":"chat_001","conversation":{"id":"chat_001","title":"My First Chat","messages":[{"role":"user","content":"encrypted_hello","timestamp":1234567890000000000,"id":"msg_1","attachments":null}],"created_at":1234567890000000000,"updated_at":1234567890000000000,"visibility":"private"}}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as your-account.testnet network-config testnet
```

### Get a Conversation

```bash
near contract call-function as-read-only ai-memory.testnet get_conversation json-args '{"chat_id":"chat_001"}' network-config testnet now
```

### Add Item to Cart

```bash
near contract call-function as-transaction ai-memory.testnet add_cart_item json-args '{"item":{"product_id":"prod_123","quantity":2,"merchant_name":"Artisan India","title":"Handmade Scarf","price":1999,"image_url":"https://example.com/scarf.jpg"}}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as your-account.testnet network-config testnet
```

### Get Cart

```bash
near contract call-function as-read-only ai-memory.testnet get_cart json-args '{}' network-config testnet now
```

### Set AI Context

```bash
near contract call-function as-transaction ai-memory.testnet update_ai_context json-args '{"encrypted_context":"encrypted_user_preferences_and_facts"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as your-account.testnet network-config testnet
```

## Security Considerations

### Access Control
- All write methods require caller to be the contract owner
- Read methods are public (but data is encrypted)
- Consider deploying per-user contracts for maximum isolation

### Encryption
- **Client-side encryption is crucial**
- Contract stores ciphertext, not plaintext
- Derive encryption keys from user's NEAR account keys
- Use AES-GCM or similar authenticated encryption

### Gas & Storage
- Large conversations consume more storage
- Consider pagination for reading large datasets
- Implement data retention policies (delete old conversations)

## Integration with Chat Client

See `chat/lib/near/storage.ts` for TypeScript client implementation:

```typescript
import { NearMemoryClient } from '@/lib/near/storage';

const client = new NearMemoryClient();
await client.init('alice.testnet');

// Save conversation
await client.saveConversation('chat_001', messages, 'My Chat');

// Get conversation
const conversation = await client.getConversation('chat_001');

// Save cart
await client.saveCart(items, merchantUrl);

// Get cart
const cart = await client.getCart();
```

## Troubleshooting

### Contract Deployment Fails

**Error:** "Account has too little balance"
- You need NEAR for deployment + storage
- Fund account: `near tokens your-account.testnet send-near ai-memory.testnet '2 NEAR' network-config testnet`

### Method Call Fails

**Error:** "Smart contract panicked: Only the owner can perform this action"
- Ensure you're signing with the contract owner account
- Use `sign-as owner-account.testnet` in CLI

### Storage Issues

**Check storage usage:**
```bash
near contract call-function as-read-only ai-memory.testnet get_storage_stats json-args '{}' network-config testnet now
```

**Optimize storage:**
- Delete old conversations
- Compress data before encryption
- Implement archival to cheaper storage (IPFS)

## Roadmap

- [ ] Batch operations for efficiency
- [ ] Conversation search/indexing
- [ ] Data export functionality
- [ ] Migration tools (PostgreSQL → NEAR)
- [ ] Conversation sharing (public visibility)
- [ ] TEE integration with Shade Agents

## License

MIT

## Support

For issues or questions:
1. Check the NEAR documentation: https://docs.near.org
2. Review test cases in `src/lib.rs`
3. Consult NEAR Discord: https://discord.gg/near
