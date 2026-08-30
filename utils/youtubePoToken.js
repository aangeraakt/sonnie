const { JSDOM } = require('jsdom');
const { createCanvas, ImageData: CanvasImageData } = require('@napi-rs/canvas');
const Logger = require('./logger');

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
let minterPromise = null;
let domWindow = null;

function patchCanvas(window) {
  const HTMLCanvasElement = window.HTMLCanvasElement;
  if (!HTMLCanvasElement) return;

  HTMLCanvasElement.prototype.getContext = function getContext(type, options) {
    if (type !== '2d') return null;
    const width = Number.isFinite(this.width) && this.width > 0 ? this.width : 300;
    const height = Number.isFinite(this.height) && this.height > 0 ? this.height : 150;
    if (!this._napiCanvas) {
      this._napiCanvas = createCanvas(width, height);
    } else {
      this._napiCanvas.width = width;
      this._napiCanvas.height = height;
    }
    return this._napiCanvas.getContext('2d', options);
  };

  HTMLCanvasElement.prototype.toDataURL = function toDataURL(...args) {
    if (!this._napiCanvas) {
      const width = Number.isFinite(this.width) && this.width > 0 ? this.width : 300;
      const height = Number.isFinite(this.height) && this.height > 0 ? this.height : 150;
      this._napiCanvas = createCanvas(width, height);
    }
    return this._napiCanvas.toDataURL(...args);
  };

  window.ImageData = CanvasImageData;
  if (!globalThis.ImageData) {
    globalThis.ImageData = CanvasImageData;
  }
}

function ensureDom(userAgent) {
  if (domWindow) return;

  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://www.youtube.com/',
    referrer: 'https://www.youtube.com/',
    userAgent
  });

  domWindow = dom.window;
  patchCanvas(domWindow);

  const g = globalThis;
  g.window = domWindow;
  g.document = domWindow.document;
  g.location = domWindow.location;
  g.origin = 'https://www.youtube.com';
  if (!g.self) g.self = g;
  if (!g.navigator) {
    Object.defineProperty(g, 'navigator', { value: domWindow.navigator, configurable: true });
  }
}

async function createMinter(yt) {
  const { BotGuardClient } = await import('bgutils-js/botguard');
  const { WebPoMinter } = await import('bgutils-js/webpo');
  const { buildURL, getHeaders, USER_AGENT } = await import('bgutils-js/utils');

  ensureDom(USER_AGENT);

  const challengeResponse = await yt.getAttestationChallenge('ENGAGEMENT_TYPE_UNBOUND');
  const challenge = challengeResponse?.bg_challenge;
  if (!challenge?.program || !challenge.global_name) {
    throw new Error('YouTube BotGuard challenge unavailable');
  }

  const interpreterUrl = challenge.interpreter_url?.private_do_not_access_or_else_trusted_resource_url_wrapped_value;
  if (!interpreterUrl) {
    throw new Error('YouTube BotGuard interpreter URL missing');
  }

  const scriptUrl = interpreterUrl.startsWith('http') ? interpreterUrl : `https:${interpreterUrl}`;
  const interpreterJavascript = await fetch(scriptUrl, {
    headers: { 'user-agent': USER_AGENT }
  }).then((res) => {
    if (!res.ok) throw new Error(`BotGuard interpreter HTTP ${res.status}`);
    return res.text();
  });

  if (!interpreterJavascript) {
    throw new Error('BotGuard interpreter script empty');
  }

  const run = domWindow.Function(interpreterJavascript);
  run.call(domWindow);
  if (!globalThis[challenge.global_name] && domWindow[challenge.global_name]) {
    globalThis[challenge.global_name] = domWindow[challenge.global_name];
  }

  const botguardClient = await BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.global_name,
    globalObject: globalThis[challenge.global_name] ? globalThis : domWindow
  });

  const webPoSignalOutput = [];
  const botguardResponse = await botguardClient.snapshot({ webPoSignalOutput });

  const integrityTokenResponse = await fetch(buildURL('GenerateIT', true), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify([REQUEST_KEY, botguardResponse])
  });

  const integrityTokenJson = await integrityTokenResponse.json();
  const integrityToken = integrityTokenJson?.[0];
  if (typeof integrityToken !== 'string') {
    throw new Error('BotGuard integrity token missing');
  }

  return WebPoMinter.create({
    integrityToken,
    estimatedTtlSecs: integrityTokenJson[1],
    mintRefreshThreshold: integrityTokenJson[2],
    websafeFallbackToken: integrityTokenJson[3]
  }, webPoSignalOutput);
}

function getMinter(yt) {
  if (!minterPromise) {
    minterPromise = createMinter(yt).catch((err) => {
      minterPromise = null;
      throw err;
    });
  }
  return minterPromise;
}

async function mintPoToken(yt, binding) {
  if (!binding) throw new Error('PO token binding missing');
  const minter = await getMinter(yt);
  return minter.mintAsWebsafeString(binding);
}

async function mintPoTokenSafe(yt, binding) {
  try {
    return await mintPoToken(yt, binding);
  } catch (err) {
    Logger.warn('[YouTube] PO token mint failed:', err.message);
    return null;
  }
}

module.exports = {
  mintPoToken,
  mintPoTokenSafe
};
