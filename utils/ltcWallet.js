const crypto = require('crypto');
const bitcoin = require('bitcoinjs-lib');
const ecc = require('@bitcoinerlab/secp256k1');
const { ECPairFactory } = require('ecpair');
const { xchacha20poly1305 } = require('@noble/ciphers/chacha.js');
const { randomBytes, bytesToHex, hexToBytes } = require('@noble/ciphers/utils.js');

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const LITECOIN = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'ltc',
  bip32: {
    public: 0x019da462,
    private: 0x019d9cfe
  },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0
};

const API_BASE = 'https://litecoinspace.org/api';
const EXPLORER = 'https://litecoinspace.org';
const SATS = 100000000;
const DUST = 546;
const MAX_WALLETS = 5;

function masterKey() {
  const secret = process.env.LTC_ENCRYPTION_KEY || process.env.DISCORD_TOKEN || 'sonnies-ltc';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptSecret(plain) {
  const nonce = randomBytes(24);
  const cipher = xchacha20poly1305(masterKey(), nonce);
  const encrypted = cipher.encrypt(Buffer.from(String(plain), 'utf8'));
  return `${bytesToHex(nonce)}:${bytesToHex(encrypted)}`;
}

function decryptSecret(payload) {
  const [nonceHex, dataHex] = String(payload || '').split(':');
  if (!nonceHex || !dataHex) throw new Error('Wallet secret is unreadable.');
  const cipher = xchacha20poly1305(masterKey(), hexToBytes(nonceHex));
  return Buffer.from(cipher.decrypt(hexToBytes(dataHex))).toString('utf8');
}

function toSats(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * SATS);
}

function fromSats(sats) {
  return (Number(sats || 0) / SATS).toFixed(8).replace(/\.?0+$/, '');
}

function createKeypair() {
  const keyPair = ECPair.makeRandom({ network: LITECOIN });
  const payment = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: LITECOIN
  });
  return {
    address: payment.address,
    wif: keyPair.toWIF()
  };
}

function isValidAddress(address) {
  try {
    bitcoin.address.toOutputScript(String(address), LITECOIN);
    return true;
  } catch (err) {
    return false;
  }
}

function normalizeName(name, used) {
  const cleaned = String(name || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  if (cleaned) return cleaned;
  if (!used.includes('main')) return 'main';
  let index = 2;
  while (used.includes(`wallet${index}`)) index += 1;
  return `wallet${index}`;
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `Litecoin API error ${res.status}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    return text;
  }
}

async function getAddressInfo(address) {
  return api(`/address/${encodeURIComponent(address)}`);
}

function balanceFromInfo(info) {
  const chain = info?.chain_stats || {};
  const mempool = info?.mempool_stats || {};
  const confirmed = (chain.funded_txo_sum || 0) - (chain.spent_txo_sum || 0);
  const pending = (mempool.funded_txo_sum || 0) - (mempool.spent_txo_sum || 0);
  return {
    confirmed,
    pending,
    total: confirmed + pending,
    txCount: (chain.tx_count || 0) + (mempool.tx_count || 0)
  };
}

async function getUtxos(address) {
  const utxos = await api(`/address/${encodeURIComponent(address)}/utxo`);
  return (Array.isArray(utxos) ? utxos : []).filter((utxo) => utxo.status?.confirmed && Number(utxo.value) > 0);
}

async function getTransactions(address) {
  const txs = await api(`/address/${encodeURIComponent(address)}/txs`);
  return Array.isArray(txs) ? txs : [];
}

async function getFeeRate() {
  try {
    const fees = await api('/v1/fees/recommended');
    return Math.max(1, Number(fees.halfHourFee || fees.fastestFee || 1));
  } catch (err) {
    return 2;
  }
}

async function getUsdPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd', {
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = Number(data?.litecoin?.usd);
    return Number.isFinite(price) ? price : null;
  } catch (err) {
    return null;
  }
}

function estimateVsize(inputs, outputs) {
  return Math.ceil(10.5 + (inputs * 68) + (outputs * 31));
}

function selectUtxos(utxos, target, satPerVb) {
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const selected = [];
  let total = 0;
  for (const utxo of sorted) {
    selected.push(utxo);
    total += Number(utxo.value);
    const feeOne = estimateVsize(selected.length, 1) * satPerVb;
    const feeTwo = estimateVsize(selected.length, 2) * satPerVb;
    if (total >= target + feeTwo && total - target - feeTwo >= DUST) {
      return { selected, total, fee: feeTwo, change: total - target - feeTwo };
    }
    if (total >= target + feeOne) {
      return { selected, total, fee: feeOne, change: 0 };
    }
  }
  return null;
}

function buildSignedTx(wif, fromAddress, toAddress, amountSats, utxos, satPerVb) {
  const plan = selectUtxos(utxos, amountSats, satPerVb);
  if (!plan) return { error: 'Not enough confirmed LTC to cover this amount plus network fee.' };

  const keyPair = ECPair.fromWIF(wif, LITECOIN);
  const payment = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: LITECOIN
  });
  if (payment.address !== fromAddress) {
    return { error: 'Wallet key does not match the saved address.' };
  }

  const psbt = new bitcoin.Psbt({ network: LITECOIN });
  for (const utxo of plan.selected) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: payment.output,
        value: Number(utxo.value)
      }
    });
  }
  psbt.addOutput({ address: toAddress, value: amountSats });
  if (plan.change >= DUST) {
    psbt.addOutput({ address: fromAddress, value: plan.change });
  }
  for (let i = 0; i < plan.selected.length; i += 1) {
    psbt.signInput(i, keyPair);
  }
  psbt.finalizeAllInputs();

  return {
    hex: psbt.extractTransaction().toHex(),
    fee: plan.fee,
    change: plan.change,
    inputs: plan.selected.length
  };
}

async function broadcastTx(hex) {
  const res = await fetch(`${API_BASE}/tx`, {
    method: 'POST',
    body: hex,
    signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'text/plain' }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Broadcast failed (${res.status})`);
  return text.trim();
}

function netForAddress(tx, address) {
  let sent = 0;
  let received = 0;
  for (const vin of tx.vin || []) {
    if (vin.prevout?.scriptpubkey_address === address) sent += Number(vin.prevout.value || 0);
  }
  for (const vout of tx.vout || []) {
    if (vout.scriptpubkey_address === address) received += Number(vout.value || 0);
  }
  return received - sent;
}

function explorerTx(txid) {
  return `${EXPLORER}/tx/${txid}`;
}

function explorerAddress(address) {
  return `${EXPLORER}/address/${address}`;
}

function qrUrl(address) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(address)}`;
}

module.exports = {
  LITECOIN,
  EXPLORER,
  SATS,
  MAX_WALLETS,
  encryptSecret,
  decryptSecret,
  toSats,
  fromSats,
  createKeypair,
  isValidAddress,
  normalizeName,
  getAddressInfo,
  balanceFromInfo,
  getUtxos,
  getTransactions,
  getFeeRate,
  getUsdPrice,
  buildSignedTx,
  broadcastTx,
  netForAddress,
  explorerTx,
  explorerAddress,
  qrUrl
};
