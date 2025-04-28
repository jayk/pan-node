// node/agentAuthManager.js

const uuid = require('uuid');
const jwt = require('jsonwebtoken');
const { log } = require('../utils/log');
//import { relayAuthToAgent } from './relayAgent.js'; // We'll stub this out cleanly

const pendingAuthRequests = new Map(); // auth_request_id → { callback, tries }
let config = {
    order: ['local'],
    max_tries: 2,
    timeout_ms: 3000,
    local: {
        type: 'local',
        secret: 'default-secret'
    }
};

function initialize(userConfig = {}) {
    config = {
        ...config,
        ...userConfig
    };
    log.info('[agentAuthManager] Initialized with methods:', config.order.join(' → '));
    return {
        submitAuthRequest
    };
}

function submitAuthRequest(authPayload, callback) {
    const authRequestId = uuid.v4();

    pendingAuthRequests.set(authRequestId, {
        callback,
        tries: 0
    });

    attemptAuth(authRequestId, authPayload);
}

async function attemptAuth(authRequestId, authPayload) {
    const pending = pendingAuthRequests.get(authRequestId);
    if (!pending) return;

    const methodName = config.order[pending.tries];
    if (!methodName) {
        finishAuthRequest(authRequestId, { success: false, error: 'No auth methods left' });
        return;
    }

    pending.tries++;

    const methodConfig = config[methodName];
    if (!methodConfig || !methodConfig.type) {
        throw new Error(`Invalid auth method config for '${methodName}'`);
    }

    try {
        let authPromise;

        switch (methodConfig.type) {
            case 'local':
                console.log('FOOOOOOOOOO');
                authPromise = performLocalAuth(authPayload, methodConfig);
                console.log('BARRRRRR');
                break;
            case 'special-agent':
                authPromise = relayAuthToAgent(authRequestId, authPayload, methodConfig);
                break;
            default:
                throw new Error(`Unknown auth type: ${methodConfig.type}`);
        }

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Auth timeout')), config.timeout_ms);
        });

        const result = await Promise.race([authPromise, timeoutPromise]);
        console.log('BATTTTT');

        finishAuthRequest(authRequestId, result);

    } catch (err) {
        console.log(err);
        log.warn(`[agentAuthManager] Auth method '${methodName}' failed:`, err.message || err);

        if (pending.tries < config.max_tries) {
            attemptAuth(authRequestId, authPayload);
        } else {
            finishAuthRequest(authRequestId, { success: false, error: err.message || err });
        }
    }
}

function finishAuthRequest(authRequestId, result) {
    const pending = pendingAuthRequests.get(authRequestId);
    if (!pending) return;
    pendingAuthRequests.delete(authRequestId);
    pending.callback(result);
}

function handleAuthAgentReply(msg) {
    const { auth_request_id, success, node_id, conn_id, auth_key } = msg.payload;
    finishAuthRequest(auth_request_id, { success, node_id, conn_id, auth_key });
}

// --- Internal local auth logic ---

async function performLocalAuth(authPayload, methodConfig) {
    if (!authPayload.token) {
        return {
            success: false,
            error: 'Missing token'
        };
    }

    let decoded;
    try {
        decoded = jwt.verify(authPayload.token, methodConfig.secret);
    } catch (err) {
        return {
            success: false,
            error: 'Invalid or expired token'
        };
    }

    if (typeof decoded.identifier !== 'string' || decoded.identifier.length < 3) {
        return {
            success: false,
            error: 'Token missing valid identifier'
        };
    }

    return {
        success: true,
        info: {
            agent_name: decoded.identifier
        }
    };
}

// --- Stubs ---

async function relayAuthToAgent(authRequestId, authPayload, methodConfig) {
    // TODO: Implement actual agent relay logic later
    throw new Error('No agent available');
}


module.exports = { 
    initialize,
    submitAuthRequest,
    handleAuthAgentReply
};
