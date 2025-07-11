/**
 * agentAuthManager.js
 *
 * Manages authentication requests for agents connecting to the network.
 *
 * Supports pluggable authentication methods (e.g. local, special-agent relay),
 * with retries, timeouts, and per-request callback handling.
 *
 * In the future, all auth requests will be relayed to a special agent and
 * validated via Vouchsafe tokens — this file will serve as the dispatcher.
 */

const uuid = require('uuid');
const jwt = require('jsonwebtoken');
const { log } = require('../utils/log');
const { getTrustValidator } = require('./vouchsafeTrust');
// import { relayAuthToAgent } from './relayAgent.js'; // Future: enable dynamic dispatch to an auth agent

const pendingAuthRequests = new Map(); // auth_request_id → { callback, tries }

let config = {
    order: ['local'],
    max_tries: 2,
    timeout_ms: 3000,
    methods: {
        local: {
            type: 'local',
            allow_untrusted_agents: true,
            trusted_agents_config_file: "trusted_agents.json"
        }
    }
};

let methods = {};

/**
 * Initializes the agentAuthManager with configuration.
 *
 * @param {object} userConfig - Optional override for default settings.
 * @returns {object} API for submitting authentication requests.
 */
function initialize(userConfig = {}) {
    config = {
        ...config,
        ...userConfig
    };
    // load the local trust validator on initialize
    methods.local = getTrustValidator('local', { path: config.methods.local.trusted_agents_config_file });

    log.info('[agentAuthManager] Initialized with methods:', config.order.join(' → '));

    return {
        submitAuthRequest
    };
}

/**
 * Public entry point to authenticate an agent.
 * Registers a callback and starts the auth attempt process.
 *
 * @param {object} authPayload - Data provided by the client for authentication.
 * @param {function} callback - Called with auth result (success or failure).
 */
function submitAuthRequest(authPayload, callback) {
    const authRequestId = uuid.v4();

    pendingAuthRequests.set(authRequestId, {
        callback,
        tries: 0
    });

    attemptAuth(authRequestId, authPayload);
}

/**
 * Core logic to attempt authentication using one method in the configured order.
 * Handles retries and timeout.
 *
 * @param {string} authRequestId
 * @param {object} authPayload
 */
async function attemptAuth(authRequestId, authPayload) {
    const pending = pendingAuthRequests.get(authRequestId);
    if (!pending) return;

    const methodName = config.order[pending.tries];

    if (!methodName) {
        finishAuthRequest(authRequestId, { success: false, error: 'No auth methods left' });
        return;
    }

    pending.tries++;

    const methodConfig = config.methods[methodName];

    if (!methodConfig || !methodConfig.type) {
        throw new Error(`Invalid auth method config for '${methodName}'`);
    }

    try {
        let authPromise;

        switch (methodConfig.type) {
            case 'local':
                // Future: remove this path entirely when relay+vouchsafe is standard
                authPromise = performLocalAuth(authPayload, methodConfig);
                break;

            case 'special-agent':
                // Future: replace with full Vouchsafe token validation via external agent
                authPromise = relayAuthToAgent(authRequestId, authPayload, methodConfig);
                break;

            default:
                throw new Error(`Unknown auth type: ${methodConfig.type}`);
        }

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Auth timeout')), config.timeout_ms);
        });

        const result = await Promise.race([authPromise, timeoutPromise]);

        finishAuthRequest(authRequestId, result);
    } catch (err) {
        log.error(err);

        log.warn(`[agentAuthManager] Auth method '${methodName}' failed:`, err.message || err);

        if (pending.tries < config.max_tries) {
            attemptAuth(authRequestId, authPayload);
        } else {
            finishAuthRequest(authRequestId, {
                success: false,
                error: err.message || err
            });
        }
    }
}

/**
 * Finalizes an auth attempt by calling the registered callback.
 *
 * @param {string} authRequestId
 * @param {object} result - Auth result (e.g., success, error, agent info)
 */
function finishAuthRequest(authRequestId, result) {
    const pending = pendingAuthRequests.get(authRequestId);
    if (!pending) return;

    pendingAuthRequests.delete(authRequestId);

    pending.callback(result);
}

/**
 * Handles replies from an external agent providing the result of a delegated auth request.
 *
 * @param {object} msg - The relay message from the auth agent.
 */
function handleAuthAgentReply(msg) {
    const { auth_request_id, success, node_id, conn_id, auth_key } = msg.payload;

    finishAuthRequest(auth_request_id, {
        success,
        node_id,
        conn_id,
        auth_key
    });
}

// --- Internal local-only fallback auth method ---

/**
 * Performs basic local token validation using a shared secret.
 * Only used in early deployments; intended for removal later.
 *
 * @param {object} authPayload - Contains a JWT token.
 * @param {object} methodConfig - Must include a `secret` for verification.
 * @returns {Promise<object>} Result object with success or failure.
 */
async function performLocalAuth(authPayload, methodConfig) {
    if (!authPayload.token) {
        return {
            success: false,
            error: 'Missing token'
        };
    }

    // step one, validate the token.
    
    let decoded;

    try {
        decoded = await methods.local.validateToken(authPayload.token);
//        log.warn('MMMMMMMMMMMMMMMMm', decoded);
    } catch (err) {
        log.warn('Local auth failed, token error: ', err);
        return {
            success: false,
            error: 'Access Denied'
        };
    }

//    log.warn("XXXXX", methodConfig);
    if (methodConfig.allow_untrusted_agents) {
        return {
            success: true,
            info: {
                agent_name: decoded.identifier || decoded.iss,
                vouchsafe_id: decoded.iss
            },
            token: decoded
        };
    };
    
//    log.warn("YYYYY Attempting trust test", decoded);
    let trustResult;
    // If we are here, the token validated, but we don't know if we trust it.
    try {
        trustResult = await methods.local.isTokenTrusted(authPayload.token, authPayload.tokens, ['agent-connect']);
        if (trustResult.trusted) {
            return {
                success: true,
                info: {
                    agent_name: trustResult.decoded.identifier || trustResult.decoded.iss,
                    vouchsafe_id: trustResult.decoded.iss
                },
                token: trustResult.decoded
            };
        } else {
            log.warn('Local auth failed, issuer not trusted for agent-connect. ');
            return {
                success: false,
                error: 'Access Denied'
            };
        }
    } catch (err) {
        log.warn('Local auth failed, trust check error: ', err);
        return {
            success: false,
            error: 'Access Denied'
        };
    }

    // we shouldn't be able to get here... but just in case.
    return {
        success: false,
        error: 'Access Denied'
    };
}

// --- Stubbed out relay method for future implementation ---

/**
 * Placeholder for relaying auth requests to an external agent.
 *
 * Future: send request to special agent that verifies Vouchsafe token.
 *
 * @param {string} authRequestId
 * @param {object} authPayload
 * @param {object} methodConfig
 */
async function relayAuthToAgent(authRequestId, authPayload, methodConfig) {
    // TODO: Implement actual agent relay logic for Vouchsafe verification
    throw new Error('No agent available');
}

module.exports = { 
    initialize,
    submitAuthRequest,
    handleAuthAgentReply
};
