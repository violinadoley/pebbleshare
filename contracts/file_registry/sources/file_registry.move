module file_registry::file_registry {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;

    /// File metadata stored on-chain
    struct FileMetadata has key, store {
        id: UID,
        filename: vector<u8>,      // Original filename
        owner: address,            // File owner's Sui address
        price: u64,               // Price in MIST (smallest unit)
        blob_id: vector<u8>,      // Walrus blob ID
        key_id: vector<u8>,       // Seal backup key ID (hex string)
        created_at: u64,          // Timestamp in milliseconds
        original_size: u64,       // Original file size in bytes
    }

    /// Event emitted when a file is registered
    struct FileRegisteredEvent has copy, drop {
        file_id: ID,
        owner: address,
        filename: vector<u8>,
        price: u64,
    }

    /// Create and transfer file metadata object to the owner
    /// Returns the object ID of the created FileMetadata
    public fun create_file_metadata(
        filename: vector<u8>,
        owner: address,
        price: u64,
        blob_id: vector<u8>,
        key_id: vector<u8>,
        original_size: u64,
        ctx: &mut TxContext
    ): ID {
        let metadata = FileMetadata {
            id: object::new(ctx),
            filename,
            owner,
            price,
            blob_id,
            key_id,
            created_at: tx_context::epoch_timestamp_ms(ctx),
            original_size,
        };

        let id = object::id(&metadata);
        
        // Emit event
        event::emit(FileRegisteredEvent {
            file_id: id,
            owner,
            filename: *&metadata.filename,
            price,
        });

        // Transfer to owner
        transfer::transfer(metadata, owner);
        
        id
    }

    /// Get filename (public view function)
    public fun filename(metadata: &FileMetadata): vector<u8> {
        metadata.filename
    }

    /// Get owner address
    public fun owner(metadata: &FileMetadata): address {
        metadata.owner
    }

    /// Get price
    public fun price(metadata: &FileMetadata): u64 {
        metadata.price
    }

    /// Get blob ID
    public fun blob_id(metadata: &FileMetadata): vector<u8> {
        metadata.blob_id
    }

    /// Get key ID
    public fun key_id(metadata: &FileMetadata): vector<u8> {
        metadata.key_id
    }

    /// Get creation timestamp
    public fun created_at(metadata: &FileMetadata): u64 {
        metadata.created_at
    }

    /// Get original file size
    public fun original_size(metadata: &FileMetadata): u64 {
        metadata.original_size
    }

    /// Update price (only owner can do this via transfer policy or by checking owner in entry function)
    /// For now, we'll make it simple - anyone can update, but you can add owner checks later
    public fun update_price(metadata: &mut FileMetadata, new_price: u64) {
        metadata.price = new_price;
    }
}
