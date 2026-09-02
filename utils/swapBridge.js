/**
 * Sonnies Non-Custodial Crypto Swap Bridge
 * Uses SideShift.ai public accountless bridge to swap between LTC and USDT (TRC-20)
 * without requiring any centralized exchange account, registration, or KYC.
 */

const API_BASE = 'https://sideshift.ai/api/v2';
const WEB_BASE = 'https://sideshift.ai';

const SUPPORTED_PAIRS = {
  'ltc-to-usdt': {
    from: 'LTC',
    fromNetwork: 'litecoin',
    to: 'USDT',
    toNetwork: 'tron',
    apiPair: 'ltc/usdt-tron',
    webPair: { depositMethod: 'ltc', settleMethod: 'usdt-tron' },
    label: 'Litecoin (LTC) ➔ Tether (USDT TRC-20)'
  },
  'usdt-to-ltc': {
    from: 'USDT',
    fromNetwork: 'tron',
    to: 'LTC',
    toNetwork: 'litecoin',
    apiPair: 'usdt-tron/ltc',
    webPair: { depositMethod: 'usdt-tron', settleMethod: 'ltc' },
    label: 'Tether (USDT TRC-20) ➔ Litecoin (LTC)'
  }
};

/**
 * Fetch live bridge exchange rate, min/max limits for a swap pair.
 * Fully public, zero API keys required.
 */
async function getPairRate(direction = 'ltc-to-usdt') {
  const pairConfig = SUPPORTED_PAIRS[direction];
  if (!pairConfig) throw new Error(`Unsupported swap pair: ${direction}`);

  const res = await fetch(`${API_BASE}/pair/${pairConfig.apiPair}`, {
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch bridge rate (HTTP ${res.status})`);
  }

  const data = await res.json();
  return {
    direction,
    from: pairConfig.from,
    to: pairConfig.to,
    fromNetwork: pairConfig.fromNetwork,
    toNetwork: pairConfig.toNetwork,
    label: pairConfig.label,
    min: Number(data.min) || 0,
    max: Number(data.max) || 0,
    rate: Number(data.rate) || 0,
    raw: data
  };
}

/**
 * Create a new swap shift order with SideShift.ai
 */
async function createShift({ direction, settleAddress, refundAddress, depositAmount = null }) {
  const pairConfig = SUPPORTED_PAIRS[direction];
  if (!pairConfig) throw new Error(`Unsupported swap pair: ${direction}`);

  const affiliateId = process.env.SIDESHIFT_AFFILIATE_ID || '';
  const secret = process.env.SIDESHIFT_SECRET || '';

  if (!affiliateId) {
    const webUrl = `${WEB_BASE}/?depositMethod=${pairConfig.webPair.depositMethod}&settleMethod=${pairConfig.webPair.settleMethod}&settleAddress=${encodeURIComponent(settleAddress)}`;
    return {
      automated: false,
      reason: 'MISSING_API_KEY',
      webUrl,
      message: 'Automated bridge execution requires SIDESHIFT_AFFILIATE_ID in .env. You can still use the instant web bridge link.'
    };
  }

  const payload = {
    depositCoin: pairConfig.from,
    depositNetwork: pairConfig.fromNetwork,
    settleCoin: pairConfig.to,
    settleNetwork: pairConfig.toNetwork,
    settleAddress,
    affiliateId
  };

  if (refundAddress) {
    payload.refundAddress = refundAddress;
  }

  const headers = {
    'Content-Type': 'application/json'
  };

  if (secret) {
    headers['x-sideshift-secret'] = secret;
  }

  const res = await fetch(`${API_BASE}/shifts/variable`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    const msg = data?.error?.message || `Bridge returned error status ${res.status}`;
    throw new Error(msg);
  }

  const depositAddr = data.depositAddress?.address || data.depositAddress;
  return {
    automated: true,
    id: data.id,
    depositAddress: depositAddr,
    settleAddress: data.settleAddress?.address || data.settleAddress || settleAddress,
    depositCoin: pairConfig.from,
    depositNetwork: pairConfig.fromNetwork,
    settleCoin: pairConfig.to,
    settleNetwork: pairConfig.toNetwork,
    expiresAt: data.expiresAt || null,
    status: data.status || 'waiting',
    orderUrl: `${WEB_BASE}/orders/${data.id}`,
    raw: data
  };
}

/**
 * Fetch real-time status of an ongoing or completed shift order.
 * Fully public, zero API keys required.
 */
async function getShiftStatus(shiftId) {
  if (!shiftId) throw new Error('Missing shift ID');

  const res = await fetch(`${API_BASE}/shifts/${encodeURIComponent(shiftId)}`, {
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Bridge status query failed (HTTP ${res.status})`);
  }

  const data = await res.json();
  return {
    id: data.id,
    status: data.status, // 'waiting', 'pending', 'processing', 'settled', 'refunded', 'expired'
    depositCoin: data.depositCoin,
    depositNetwork: data.depositNetwork,
    settleCoin: data.settleCoin,
    settleNetwork: data.settleNetwork,
    depositAddress: data.depositAddress?.address || data.depositAddress,
    settleAddress: data.settleAddress?.address || data.settleAddress,
    depositAmount: data.depositAmount ? Number(data.depositAmount) : null,
    settleAmount: data.settleAmount ? Number(data.settleAmount) : null,
    rate: data.rate ? Number(data.rate) : null,
    depositTx: data.depositTx || null,
    settleTx: data.settleTx || null,
    expiresAt: data.expiresAt || null,
    createdAt: data.createdAt || null,
    orderUrl: `${WEB_BASE}/orders/${data.id}`
  };
}

module.exports = {
  SUPPORTED_PAIRS,
  getPairRate,
  createShift,
  getShiftStatus
};
