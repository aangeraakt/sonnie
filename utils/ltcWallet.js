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

// version + locktime + both varint counts, plus the 2-byte segwit marker at
// witness weight (2/4 of a vbyte).
const TX_OVERHEAD_VSIZE = 10.5;
// A signed P2WPKH input: 41 vbytes of outpoint, script length and sequence,
// plus a 108-byte witness (72-byte signature + 33-byte pubkey + counts)
// discounted to 27. Signatures run 71-72 bytes, so the larger is assumed -
// over-estimating costs a few litoshis, under-estimating gets the transaction
// rejected outright.
const INPUT_VSIZE = 68;
// Litecoin Core relays nothing under 1 lit/vbyte, so the floor on the fee is
// the transaction's virtual size itself.
const MIN_RELAY_SAT_PER_VB = 1;

/**
 * Virtual size of one output, which depends on the script its address
 * encodes: 34 vbytes for legacy P2PKH, 32 for P2SH, 31 for P2WPKH, 43 for
 * P2WSH and P2TR. Charging P2WPKH for every output under-funds a send to an
 * `L...` address by exactly 3 vbytes, which the relay floor then rejects.
 */
function outputVsize(address) {
  try {
    return 8 + 1 + bitcoin.address.toOutputScript(String(address), LITECOIN).length;
  } catch (err) {
    return 43; // unrecognised: assume the largest standard output
  }
}

function estimateVsize(inputs, outputAddresses) {
  const outputs = outputAddresses.reduce((sum, address) => sum + outputVsize(address), 0);
  return Math.ceil(TX_OVERHEAD_VSIZE + (inputs * INPUT_VSIZE) + outputs);
}

function selectUtxos(utxos, target, satPerVb, toAddress, changeAddress) {
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const selected = [];
  let total = 0;
  for (const utxo of sorted) {
    selected.push(utxo);
    total += Number(utxo.value);
    const feeWithChange = estimateVsize(selected.length, [toAddress, changeAddress]) * satPerVb;
    const feeNoChange = estimateVsize(selected.length, [toAddress]) * satPerVb;
    if (total >= target + feeWithChange && total - target - feeWithChange >= DUST) {
      return { selected, total, fee: feeWithChange, change: total - target - feeWithChange };
    }
    if (total >= target + feeNoChange) {
      // What is left over is below the dust threshold, so it goes to the miner
      // rather than becoming an output nobody can spend. The fee is therefore
      // everything the outputs do not claim, not the estimate.
      return { selected, total, fee: total - target, change: 0 };
    }
  }
  return null;
}

function buildSignedTx(wif, fromAddress, toAddress, amountSats, utxos, satPerVb) {
  const plan = selectUtxos(utxos, amountSats, satPerVb, toAddress, fromAddress);
  if (!plan) return { error: 'Not enough confirmed LTC to cover this amount plus network fee.' };

  const keyPair = ECPair.fromWIF(wif, LITECOIN);
  const payment = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: LITECOIN
  });
  if (payment.address !== fromAddress) {
    return { error: 'Wallet key does not match the saved address.' };
  }

  const assemble = (change) => {
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
    if (change >= DUST) {
      psbt.addOutput({ address: fromAddress, value: change });
    }
    for (let i = 0; i < plan.selected.length; i += 1) {
      psbt.signInput(i, keyPair);
    }
    psbt.finalizeAllInputs();
    return psbt.extractTransaction();
  };

  // Everything above works from a projected size. This is the transaction that
  // will actually be relayed, so the fee is checked against its real virtual
  // size before it goes anywhere - a signature one byte shorter than assumed,
  // or an output type the estimate got wrong, is the difference between a
  // confirmed send and a `min relay fee not met` rejection.
  const rate = Math.max(Number(satPerVb) || 0, MIN_RELAY_SAT_PER_VB);
  const requiredFee = (tx) => Math.ceil(tx.virtualSize() * rate);
  const feeFor = (change) => plan.total - amountSats - (change >= DUST ? change : 0);

  let change = plan.change;
  let tx = assemble(change);

  if (feeFor(change) < requiredFee(tx)) {
    const shortfall = requiredFee(tx) - feeFor(change);
    // Top the fee up out of the change, or drop the change output entirely
    // when trimming it would leave dust behind.
    change = change - shortfall >= DUST ? change - shortfall : 0;
    tx = assemble(change);
    if (feeFor(change) < requiredFee(tx)) {
      return { error: 'Not enough confirmed LTC to cover the network fee for this transaction.' };
    }
  }

  return {
    hex: tx.toHex(),
    fee: feeFor(change),
    change: change >= DUST ? change : 0,
    inputs: plan.selected.length,
    vsize: tx.virtualSize()
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
