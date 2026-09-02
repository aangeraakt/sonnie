const crypto = require('crypto');
const { secp256k1 } = require('@noble/curves/secp256k1.js');
const { keccak_256 } = require('@noble/hashes/sha3.js');
const { xchacha20poly1305 } = require('@noble/ciphers/chacha.js');
const { randomBytes, bytesToHex, hexToBytes } = require('@noble/ciphers/utils.js');

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const API_BASE = 'https://api.trongrid.io';
const EXPLORER = 'https://tronscan.org/#';
const UNITS = 1000000;
const FEE_LIMIT = 30000000;
const PUBLIC_RPC = 'https://tron-rpc.publicnode.com';
const MAX_WALLETS = 5;
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

function masterKey() {
  const secret = process.env.USDT_ENCRYPTION_KEY || process.env.LTC_ENCRYPTION_KEY || process.env.DISCORD_TOKEN || 'sonnies-usdt';
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

function toUnits(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * UNITS);
}

function fromUnits(units) {
  const formatted = (Number(units || 0) / UNITS).toFixed(6).replace(/\.?0+$/, '');
  return formatted || '0';
}

function fromSun(sun) {
  const formatted = (Number(sun || 0) / UNITS).toFixed(6).replace(/\.?0+$/, '');
  return formatted || '0';
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest();
}

function base58Encode(bytes) {
  let zeroes = 0;
  while (zeroes < bytes.length && bytes[zeroes] === 0) zeroes += 1;
  const size = Math.ceil(((bytes.length - zeroes) * 138) / 100) + 1;
  const b58 = Buffer.alloc(size);
  let length = 0;
  for (let i = zeroes; i < bytes.length; i += 1) {
    let carry = bytes[i];
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k -= 1, j += 1) {
      carry += 256 * b58[k];
      b58[k] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    length = j;
  }
  let it = size - length;
  while (it < size && b58[it] === 0) it += 1;
  let str = '1'.repeat(zeroes);
  for (; it < size; it += 1) str += BASE58[b58[it]];
  return str;
}

function base58Decode(text) {
  const str = String(text || '');
  let zeroes = 0;
  while (zeroes < str.length && str[zeroes] === '1') zeroes += 1;
  const size = Math.ceil(((str.length - zeroes) * 733) / 1000) + 1;
  const b256 = Buffer.alloc(size);
  let length = 0;
  for (let i = zeroes; i < str.length; i += 1) {
    const ch = BASE58.indexOf(str[i]);
    if (ch < 0) return null;
    let carry = ch;
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k -= 1, j += 1) {
      carry += 58 * b256[k];
      b256[k] = carry % 256;
      carry = Math.floor(carry / 256);
    }
    length = j;
  }
  let it = size - length;
  while (it < size && b256[it] === 0) it += 1;
  const out = Buffer.alloc(zeroes + (size - it));
  b256.copy(out, zeroes, it);
  return out;
}

function encodeAddress(payload) {
  const checksum = sha256(sha256(payload)).subarray(0, 4);
  return base58Encode(Buffer.concat([payload, checksum]));
}

function decodeAddress(address) {
  const decoded = base58Decode(address);
  if (!decoded || decoded.length !== 25) return null;
  const payload = decoded.subarray(0, 21);
  const checksum = decoded.subarray(21);
  const expected = sha256(sha256(payload)).subarray(0, 4);
  if (!checksum.equals(expected) || payload[0] !== 0x41) return null;
  return payload;
}

function publicKeyToAddress(publicKey) {
  const pub = Buffer.from(publicKey);
  const body = pub[0] === 0x04 ? pub.subarray(1) : pub;
  const hash = Buffer.from(keccak_256(body));
  const payload = Buffer.concat([Buffer.from([0x41]), hash.subarray(-20)]);
  return encodeAddress(payload);
}

function createKeypair() {
  const { secretKey } = secp256k1.keygen();
  const publicKey = secp256k1.getPublicKey(secretKey, false);
  return {
    address: publicKeyToAddress(publicKey),
    secret: Buffer.from(secretKey).toString('hex')
  };
}

function isValidAddress(address) {
  return ADDRESS_RE.test(String(address || '')) && Boolean(decodeAddress(address));
}

function normalizeName(name, used) {
  const cleaned = String(name || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  if (cleaned) return cleaned;
  if (!used.includes('main')) return 'main';
  let index = 2;
  while (used.includes(`wallet${index}`)) index += 1;
  return `wallet${index}`;
}

function apiHeaders(extra = {}) {
  const headers = {
    Accept: 'application/json',
    ...extra
  };
  const key = process.env.TRONGRID_API_KEY || process.env.TRON_API_KEY;
  if (key) headers['TRON-PRO-API-KEY'] = key;
  return headers;
}

async function api(path, options = {}, retried = false) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    signal: AbortSignal.timeout(15000),
    headers: apiHeaders(options.headers || {})
  });
  const text = await res.text();
  if ((res.status === 429 || (text && text.includes('allowed_rps'))) && !retried) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return api(path, options, true);
  }
  if (!res.ok) {
    throw new Error(readableError(text) || `Tron API error ${res.status}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    return text;
  }
}

function readableError(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    const msg = parsed?.Error || parsed?.message || parsed?.result?.message || parsed?.error;
    if (msg) return readableError(msg);
  } catch (err) {}
  if (/^[0-9a-fA-F]+$/.test(text) && text.length % 2 === 0 && text.length >= 8) {
    try {
      const decoded = Buffer.from(text, 'hex').toString('utf8').replace(/[^\x20-\x7E]/g, '').trim();
      if (decoded) return decoded;
    } catch (err) {}
  }
  return text;
}

async function getRpcAddressInfo(address) {
  const payload = decodeAddress(address);
  if (!payload) return { balance: 0, trc20: [], trc20txcount: 0 };
  const hexAddr = payload.toString('hex');
  const param = payload.subarray(1).toString('hex').padStart(64, '0');
  const contractPayload = decodeAddress(USDT_CONTRACT);
  const contractHex = contractPayload ? contractPayload.toString('hex') : '41a614f803b6fd780986a42c78ec9c7f77e6ded13c';

  const [trxData, usdtData] = await Promise.all([
    fetch(`${PUBLIC_RPC}/wallet/getaccount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: hexAddr }),
      signal: AbortSignal.timeout(10000)
    }).then((r) => r.json()).catch(() => ({})),
    fetch(`${PUBLIC_RPC}/wallet/triggerconstantcontract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner_address: hexAddr,
        contract_address: contractHex,
        function_selector: 'balanceOf(address)',
        parameter: param
      }),
      signal: AbortSignal.timeout(10000)
    }).then((r) => r.json()).catch(() => ({}))
  ]);

  const hexBal = usdtData?.constant_result?.[0] || '0';
  let usdtAmount = 0;
  try {
    usdtAmount = Number(BigInt('0x' + hexBal));
  } catch (e) {}

  return {
    balance: Number(trxData?.balance || 0),
    trc20: [{ [USDT_CONTRACT]: usdtAmount }],
    trc20txcount: 0
  };
}

async function getAddressInfo(address) {
  try {
    const data = await api(`/v1/accounts/${encodeURIComponent(address)}`);
    const account = Array.isArray(data?.data) ? data.data[0] : null;
    if (account) return account;
  } catch (err) {
    // TronGrid failed or was rate-limited; fallback to direct Full Node RPC
  }
  return getRpcAddressInfo(address);
}

function parseUsdtAmount(account) {
  const rows = account?.trc20;
  if (!Array.isArray(rows)) return 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const value = row[USDT_CONTRACT] ?? row[USDT_CONTRACT.toLowerCase()];
    if (value != null) return Number(value) || 0;
  }
  return 0;
}

function balanceFromInfo(info) {
  return {
    usdt: parseUsdtAmount(info),
    trx: Number(info?.balance || 0),
    txCount: Number(info?.trc20txcount || info?.transactions_in || 0)
  };
}

async function getTransactions(address) {
  const data = await api(`/v1/accounts/${encodeURIComponent(address)}/transactions/trc20?contract_address=${USDT_CONTRACT}&limit=20`);
  return Array.isArray(data?.data) ? data.data : [];
}

async function getUsdPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd', {
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return 1;
    const data = await res.json();
    const price = Number(data?.tether?.usd);
    return Number.isFinite(price) ? price : 1;
  } catch (err) {
    return 1;
  }
}

function encodeTransferParams(toAddress, amountUnits) {
  const payload = decodeAddress(toAddress);
  if (!payload) throw new Error('Invalid destination address.');
  const addr = payload.subarray(1).toString('hex').padStart(64, '0');
  const amount = BigInt(amountUnits).toString(16).padStart(64, '0');
  return addr + amount;
}

function signTx(transaction, secretHex) {
  const hash = Buffer.from(String(transaction.txID), 'hex');
  const secretKey = hexToBytes(String(secretHex).replace(/^0x/i, ''));
  const recovered = secp256k1.sign(hash, secretKey, { prehash: false, format: 'recovered' });
  const signature = Buffer.concat([Buffer.from(recovered.subarray(1)), Buffer.from([recovered[0]])]).toString('hex');
  return {
    ...transaction,
    signature: [signature]
  };
}

async function sendUsdt(secretHex, fromAddress, toAddress, amountUnits) {
  const triggerBody = JSON.stringify({
    owner_address: fromAddress,
    contract_address: USDT_CONTRACT,
    function_selector: 'transfer(address,uint256)',
    parameter: encodeTransferParams(toAddress, amountUnits),
    fee_limit: FEE_LIMIT,
    call_value: 0,
    visible: true
  });

  let built;
  try {
    built = await api('/wallet/triggersmartcontract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: triggerBody
    });
  } catch (err) {
    try {
      const res = await fetch(`${PUBLIC_RPC}/wallet/triggersmartcontract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: triggerBody,
        signal: AbortSignal.timeout(15000)
      });
      built = await res.json();
    } catch (rpcErr) {
      return { error: err.message || 'Could not connect to Tron network.' };
    }
  }

  if (built?.result?.result === false || !built?.transaction?.txID) {
    const detail = readableError(built?.result?.message || built?.message || built?.Error);
    if (/account/i.test(detail) || /not found/i.test(detail)) {
      return { error: 'This address is not active on Tron yet. Send a small amount of TRX to it first.' };
    }
    if (/energy|bandwidth|fee|balance/i.test(detail)) {
      return { error: 'Not enough TRX energy to send USDT. Send some TRX to this address and try again.' };
    }
    return { error: detail || 'Could not build this USDT transfer.' };
  }

  const signed = signTx(built.transaction, secretHex);
  const broadcastBody = JSON.stringify(signed);

  let broadcasted;
  try {
    broadcasted = await api('/wallet/broadcasttransaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: broadcastBody
    });
  } catch (err) {
    try {
      const res = await fetch(`${PUBLIC_RPC}/wallet/broadcasttransaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: broadcastBody,
        signal: AbortSignal.timeout(15000)
      });
      broadcasted = await res.json();
    } catch (rpcErr) {
      return { error: err.message || 'Could not broadcast transaction.' };
    }
  }

  const txid = broadcasted?.txid || signed.txID;
  if (txid && (broadcasted?.result === true || broadcasted?.code === 'SUCCESS')) {
    return { txid, feeLimit: FEE_LIMIT };
  }

  const detail = readableError(broadcasted?.message || broadcasted?.Error || broadcasted?.code);
  if (txid && /dup/i.test(detail)) return { txid, feeLimit: FEE_LIMIT };
  if (/account/i.test(detail) && /does not exist/i.test(detail)) {
    return { error: 'This address is not active on Tron yet. Send a small amount of TRX to it first.' };
  }
  return { error: detail || 'Broadcast failed.' };
}

function netForTransfer(tx, address) {
  const value = Number(tx.value || 0);
  if (tx.from === address && tx.to === address) return 0;
  if (tx.to === address) return value;
  if (tx.from === address) return -value;
  return 0;
}

function explorerTx(txid) {
  return `${EXPLORER}/transaction/${txid}`;
}

function explorerAddress(address) {
  return `${EXPLORER}/address/${address}`;
}

function qrUrl(address) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(address)}`;
}

module.exports = {
  USDT_CONTRACT,
  EXPLORER,
  UNITS,
  FEE_LIMIT,
  MAX_WALLETS,
  ADDRESS_RE,
  encryptSecret,
  decryptSecret,
  toUnits,
  fromUnits,
  fromSun,
  createKeypair,
  isValidAddress,
  normalizeName,
  getAddressInfo,
  balanceFromInfo,
  getTransactions,
  getUsdPrice,
  sendUsdt,
  netForTransfer,
  explorerTx,
  explorerAddress,
  qrUrl
};
