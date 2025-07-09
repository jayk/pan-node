/**
 * panConnection.js
 *
 * Defines the structure and behavior of a PAN agent or node connection.
 *
 * Each connection wraps a WebSocket and includes helper methods to:
 * - Send control and error messages
 * - Reply to messages
 * - Swap out the underlying socket on reconnect
 * - Track and limit malformed message errors
 */

const uuid = require('uuid');
const { log } = require('../utils/log');

/**
 * Sends a control message over a raw WebSocket connection.
 *
 * @param {WebSocket} ws - Target socket
 * @param {object} data - Payload with msg_type and optional msg_id
 * @param {object} original - Original message for context (optional)
 */
function rawSendControl(ws, data, original = {}) {
    let new_msg = {
        ...data,
        type: "control",
        msg_type: data.msg_type,
        in_response_to: original.msg_id || undefined,
    };

    if (!new_msg.msg_id) {
        new_msg.msg_id = uuid.v4();
    }

    log.verbose("Sending Data:", new_msg);

    ws.send(JSON.stringify(new_msg));
}

/**
 * Sends an error response over a raw WebSocket connection.
 *
 * @param {WebSocket} ws - Target socket
 * @param {object} error - Error object with type and message
 * @param {object} original - Original message for context (optional)
 */
function rawSendError(ws, error, original = {}) {
    let errorPayload = { ...error };

    delete errorPayload.type;

    errorPayload.error_type = error.type || 'unknown';

    log.warn('Error: ', error, original);

    rawSendControl(ws, {
        msg_type: 'error',
        payload: errorPayload
    }, original);
}

/**
 * Creates a new PAN connection object that wraps a WebSocket and provides
 * common messaging methods for agents or nodes.
 *
 * @param {WebSocket} ws - Underlying socket
 * @param {string} type - Either 'agent' or 'node'
 * @param {string} name - Agent or node name (used for logging/identity)
 * @returns {object} PAN connection instance
 */
function createPanConnection(ws, type, name) {
    const id = uuid.v4();

    const conn = {
        id,
        type, // 'agent' or 'node'
        name,
        ws,
        groups: new Set(),

        /**
         * Sends a generic message over the socket.
         * Automatically assigns msg_id if missing.
         */
        send(data) {
            if (!data.msg_id) {
                data.msg_id = uuid.v4();
            }

            log.verbose("Sending Data:", data);

            this.ws.send(JSON.stringify(data));
        },

        /**
         * Sends a control message (wrapped as type "control").
         */
        sendControl(data, original = {}) {
            return rawSendControl(this.ws, data, original);
        },

        /**
         * Sends an error message (wrapped as type "error").
         */
        sendError(error, original = {}) {
            return rawSendError(this.ws, error, original);
        },

        /**
         * Responds to a specific message with a new message of a given type.
         *
         * @param {object} msg - The incoming message being responded to
         * @param {string} type - The type of the outgoing response
         * @param {object} payload - The content of the response
         */
        respondTo(msg, type, payload) {
            let response = {
                type,
                in_response_to: msg.msg_id,
                payload
            };

            log.verbose('responding to ' + msg.msg_id, response);

            this.ws.send(JSON.stringify(response));
        },

        /**
         * Replaces the current WebSocket with a new one (used on resume).
         */
        reconnect(newWs) {
            this.ws = newWs;
        },

        /**
         * Records an error for rate-limiting and closes connection
         * if too many errors are seen in a short window.
         */
        _recordError(reason, msg) {
            const now = Date.now();

            if (!this.errorLog) {
                this.errorLog = [];
            }

            this.errorLog.push(now);

            // Keep only errors within the last 60 seconds
            this.errorLog = this.errorLog.filter(ts => now - ts < 60000);

            if (this.errorLog.length > 200) {
                console.warn(`[PAN] Too many bad messages from ${this.id}, closing connection.`);
                this.sendError('Too many invalid messages. Connection closed.', msg);
                this.ws.close();
                return;
            }

            this.sendError(`Invalid message: ${reason}`, msg);
        }
    };

    // Attach the connection to the raw WebSocket for back-reference
    ws.pan = conn;

    return conn;
}

module.exports = { 
    createPanConnection,
    rawSendControl,
    rawSendError
};
