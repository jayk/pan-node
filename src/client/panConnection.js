// panConnection.js
const uuid = require('uuid');
const { log } = require('../utils/log');

function rawSendControl(ws, data, original = {}) {
    let new_msg = {
        ...data,
        type: "control",
        msg_type: data.msg_type,
        in_response_to: original.msg_id || undefined,
    };
    if (!new_msg.msg_id) new_msg.msg_id = uuid.v4();
    
    log.verbose("Sending Data:", new_msg);
    ws.send(JSON.stringify(new_msg));
}

function rawSendError(ws, error, original = {}) {
    let errorPayload= { ...error };
    delete errorPayload.type;
    errorPayload.error_type = error.type || 'unknown';
    log.warn('Error: ', error, original);
    rawSendControl(ws, {
        msg_type: 'error',
        payload: errorPayload
    }, original);
}

function createPanConnection(ws, type, name) {
    const id = uuid.v4();

    const conn = {
        id,
        type, // 'client' or 'node'
        name,
        ws,
        groups: new Set(),

        send(data) {
            if (!data.msg_id) data.msg_id = uuid.v4();
            log.verbose("Sending Data:", data);
            ws.send(JSON.stringify(data));
        },

        sendControl(data, original = {}) {
            return rawSendControl(ws, data, original);
        },

        sendError(error, original = {}) {
            return rawSendError(ws, error, original);
        },

        respondTo(msg, type, payload) {
            let response = {
                type,
                in_response_to: msg.msg_id,
                payload
            };
            log.verbose('responding to '+msg.msg_id, response);
            ws.send(JSON.stringify(response));
        },

        reconnect(newWs) {
            this.ws = newWs;
        },


        _recordError(reason, msg) {
            const now = Date.now();

            if (!this.errorLog) {
                this.errorLog = [];
            }

            this.errorLog.push(now);
            this.errorLog = this.errorLog.filter(ts => now - ts < 60000); // last 60s

            if (this.errorLog.length > 200) {
                console.warn(`[PAN] Too many bad messages from ${this.id}, closing connection.`);
                this.sendError('Too many invalid messages. Connection closed.', msg);
                this.ws.close();
                return;
            }

            this.sendError(`Invalid message: ${reason}`, msg);
        }

    };

    ws.pan = conn;
    return conn;
}

module.exports = { 
    createPanConnection,
    rawSendControl,
    rawSendError
};
