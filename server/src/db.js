const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const { join } = require('path');
const fs = require('fs');
const config = require('./config');

const file = config.dbFile || './data/db.json';
const dir = require('path').dirname(file);

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const adapter = new JSONFile(file);
const db = new Low(adapter);

async function init() {
  await db.read();
  db.data = db.data || { consumedTxs: [], files: {} };
  await db.write();
}

async function markTxConsumed(txDigest, metadata = {}) {
  await db.read();
  if (!db.data) db.data = { consumedTxs: [], files: {} };
  
  // Prevent duplicates
  const exists = db.data.consumedTxs.some(t => t.txDigest === txDigest);
  if (exists) {
    return false;
  }
  
  db.data.consumedTxs.push({ 
    txDigest, 
    consumedAt: new Date().toISOString(), 
    metadata 
  });
  await db.write();
  return true;
}

async function isTxConsumed(txDigest) {
  await db.read();
  if (!db.data) return false;
  return db.data.consumedTxs.some(t => t.txDigest === txDigest);
}

async function saveFileMetadata(fileId, meta) {
  await db.read();
  db.data = db.data || { consumedTxs: [], files: {} };
  db.data.files = db.data.files || {};
  db.data.files[fileId] = meta;
  await db.write();
}

async function getFileMetadata(fileId) {
  await db.read();
  return (db.data && db.data.files && db.data.files[fileId]) || null;
}

module.exports = { init, markTxConsumed, isTxConsumed, saveFileMetadata, getFileMetadata };