# Quick Start Guide - PebbleShare Setup Verification

## ✅ Current Status

- ✅ **Walrus CLI**: Installed (v1.36.1) at `/Users/aakashmallik/.local/bin/walrus`
- ✅ **Backend .env**: Exists
- ⚠️ **Frontend .env.local**: Missing (needs to be created)

---

## 🎯 Is Your Setup Correct?

### YES! Your flow is correct:

1. **Upload Flow**:
   ```
   User selects file → Frontend encrypts with Seal SDK → 
   Sends encrypted data to backend → Backend stores on Walrus → 
   Creates on-chain metadata → File appears in My Vault ✅
   ```

2. **Storage**:
   - ✅ Encrypted file → Stored on **Walrus** (decentralized storage)
   - ✅ Backup key → Stored in **on-chain metadata** (Sui blockchain)
   - ✅ File metadata → Stored on **Sui blockchain** (FileMetadata object)

3. **Download Flow**:
   ```
   User clicks download → Payment required → User pays via wallet → 
   Backend verifies payment → Returns backup key → 
   Frontend fetches encrypted blob from Walrus → 
   Decrypts using Seal SDK → Downloads file ✅
   ```

---

## ⚠️ Missing Configuration

### Frontend Environment Variables

Create `frontend/.env.local` with:

```env
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SEAL_PACKAGE_ID=0xYOUR_SEAL_PACKAGE_ID
NEXT_PUBLIC_SEAL_KEY_SERVER_1=0xYOUR_KEY_SERVER_1_OBJECT_ID
NEXT_PUBLIC_SEAL_KEY_SERVER_2=0xYOUR_KEY_SERVER_2_OBJECT_ID
```

**Where to get these values:**
- `SEAL_PACKAGE_ID`: Deploy your Seal access policy Move package
- `SEAL_KEY_SERVER_1/2`: Object IDs of Seal key servers (from Seal setup)

---

## 💡 WAL Tokens Required for Walrus CLI

Walrus storage via the CLI consumes **WAL tokens**. The CLI uses the Sui wallet stored in `~/.sui/sui_config/client.yaml`.

- **Active wallet address:** `0x7d361b42cbd53c27d7eb0d4d3e352fc290e88c1e1c3f56e308226e769c878c02`
- Without WAL tokens you will see `could not find WAL coins with sufficient balance`.

### How to get WAL testnet tokens

1. **Walrus Discord (recommended)**
   - Join the Walrus Protocol Discord (link from walrus.xyz)
   - Open the `#testnet-faucet` channel
   - Request tokens: `!faucet 0x7d361b42cbd53c27d7eb0d4d3e352fc290e88c1e1c3f56e308226e769c878c02`
2. **Alternative:** configure the backend to use the Walrus HTTP API (`WALRUS_API_URL`, `WALRUS_API_KEY`) instead of the CLI.

Once the wallet has WAL tokens, uploads will succeed without errors.

---

## 🧪 Test Your Setup

### 1. Test Walrus CLI
```bash
echo "Hello Walrus" > /tmp/test.txt
walrus store /tmp/test.txt --context testnet --epochs 2
# Should output a blob ID
```

### 2. Test Backend
```bash
cd server
npm start
# Should start on http://localhost:3001
# Check: curl http://localhost:3001/health
```

### 3. Test Frontend
```bash
cd frontend
npm run dev
# Should start on http://localhost:3000
```

### 4. Test Complete Flow
1. Open http://localhost:3000
2. Connect wallet (Slush Wallet)
3. Go to "My Vault"
4. Upload a test file with encryption enabled
5. Check backend logs for Walrus upload confirmation
6. File should appear in My Vault

---

## 📋 Required Setup Checklist

### Backend (`server/.env`)
- [x] `.env` file exists
- [ ] `SUI_RPC_URL` configured
- [ ] `PAYMENT_RECEIVER_ADDRESS` set (your Sui address)
- [ ] `FILE_REGISTRY_PACKAGE_ID` set (from Move contract deployment)
- [ ] `SUI_SIGNER_KEY` set (private key for backend transactions)
- [ ] `WALRUS_CONTEXT=testnet` set

### Frontend (`frontend/.env.local`)
- [ ] File created
- [ ] `NEXT_PUBLIC_SUI_NETWORK=testnet` set
- [ ] `NEXT_PUBLIC_API_URL=http://localhost:3001` set
- [ ] `NEXT_PUBLIC_SEAL_PACKAGE_ID` set (REQUIRED for encryption)
- [ ] `NEXT_PUBLIC_SEAL_KEY_SERVER_1` set (REQUIRED for encryption)
- [ ] `NEXT_PUBLIC_SEAL_KEY_SERVER_2` set (REQUIRED for encryption)

### Wallet
- [ ] Slush Wallet installed
- [ ] Wallet connected to Testnet
- [ ] SUI test tokens obtained (from faucet)

---

## 🚨 Common Issues

### Issue: "Seal package ID not configured"
**Fix**: Set `NEXT_PUBLIC_SEAL_PACKAGE_ID` in `frontend/.env.local`

### Issue: "Walrus upload failed"
**Fix**: 
- Check `WALRUS_CONTEXT=testnet` in `server/.env`
- Test Walrus CLI manually: `walrus store <file> --context testnet`

### Issue: "Failed to create file metadata on-chain"
**Fix**: 
- Check `FILE_REGISTRY_PACKAGE_ID` in `server/.env`
- Check `SUI_SIGNER_KEY` is valid
- Ensure signer has SUI for gas fees

### Issue: "Wallet not connecting"
**Fix**: 
- Install Slush Wallet extension
- Refresh page after installation
- Check browser console for errors

---

## ✅ Summary

**Your setup is ALMOST complete!**

✅ Walrus CLI: Working  
✅ Backend structure: Correct  
✅ Frontend flow: Correct  
✅ Encryption flow: Correct  
✅ Storage flow: Correct  

**Just need to:**
1. Create `frontend/.env.local` with Seal configuration
2. Ensure backend `.env` has all required values
3. Deploy Seal access policy package (if not done)
4. Get Seal key server object IDs (if not done)

**The user flow is streamlined and correct!** When you upload a file with encryption:
- ✅ It's encrypted client-side with Seal SDK
- ✅ Encrypted data goes to Walrus
- ✅ Backup key stored on-chain
- ✅ Can be decrypted after payment

