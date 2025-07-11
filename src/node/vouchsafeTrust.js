/**
 * vouchsafeTrust.js
 *
 * Loads and manages a cache of trusted Vouchsafe identities.
 * Provides an interface to validate tokens for a given purpose using `verifyTrustChain`.
 *
 * Usage:
 * const trust = getTrustValidator({ path: 'path/to/trusted.json', cache_time: 30 });
 * const result = await trust.validateToken(token);
 * const result = await trust.isTokenTrusted(token, tokens, ['agent-login']);
 */

const fs = require('fs');
const path = require('path');
const { log } = require('../utils/log');
const { verifyTrustChain, validateVouchToken } = require('vouchsafe');

const TRUST_VALIDATORS = {};

function getTrustValidator(name, config) {
    if (typeof TRUST_VALIDATORS[name] != 'object') {
        let validator = createTrustValidator(config);
        TRUST_VALIDATORS[name] = validator;
    }
    return TRUST_VALIDATORS[name];
}


function createTrustValidator(config) {
  let lastLoaded = 0;
  let trustConfig = null;
  let trustData;
  let fullPath = path.resolve(config.path);

  function loadTrustedConfig(force = false) {
    let shouldLoad = force;
    const now = Date.now();
    let cacheMs = (config.cache_time || 30) * 1000;
    if (!trustData || now - lastLoaded > cacheMs) {
        shouldLoad = true;
    }
    // What should the failure mode be? If we can't load the trusted issuers
    // do we keep what we had, or do we go blank?  
    // For now, if we had a config before, we keep it.
    if (shouldLoad == true) {
      let originalTrustConfig = trustConfig || {};
      try {
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const parsed = JSON.parse(raw);
        trustConfig = parsed || {};
        lastLoaded = now;
      } catch (err) {
        log.error(`[vouchsafeTrustUtil] Failed to load trusted config, keeping old config:`, err);
        trustConfig = originalTrustConfig;
      }
    }
  }

  function forceReload() {
    loadTrustedConfig(true);
  }

  async function validateToken(token) {
    let decoded = await validateVouchToken(token);
    return decoded;
  }

  async function isTokenTrusted(token, extra_tokens, required_purposes) {
    loadTrustedConfig();
    
    let trustedIssuers = trustConfig.trusted_issuers;

    try {
      const result = await verifyTrustChain(token, trustedIssuers, {
        tokens: extra_tokens,
        purposes: required_purposes
      });

      if (!result.valid) {
        return { trusted: false, reason: 'Trust chain invalid', result };
      }

      const original = result.chain?.[0];
      const urn = original.decoded.iss;

      return {
        trusted: true,
        vouchsfe_id: urn,
        token: original?.token,
        decoded: original?.decoded,
        chain: result.chain,
        purposes: result.purposes
      };
    } catch (err) {
      log.error('Failed Trust check:', err);
      return { trusted: false, reason: err.message || 'Unknown error', error: err };
    }
  }
    
  loadTrustedConfig(true);

  return {
    config: config,
    validateToken,
    isTokenTrusted,
    forceReload
  };
}

module.exports = { getTrustValidator, createTrustValidator };

