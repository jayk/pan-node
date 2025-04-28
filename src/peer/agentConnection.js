const { validateIncomingAgentMessage } = require('../utils/validators');
const { log } = require('../utils/log');
const panApp = require('../panApp');

class AgentConnection {
    constructor(ws, agentId, agentType, capabilities) {
        this.ws = ws;
        this.agentId = agentId;
        this.agentType = agentType;
        this.capabilities = capabilities;

        this.pendingReplies = new Map();
        this.localNodeId = panApp.getNodeId();

        ws.on('message', this._onMessage.bind(this));
        ws.on('close', () => {
            log.info(`[agent] Agent disconnected: ${agentId} (${agentType})`);
        });
    }

    _onMessage(data) {
        let msg;
        try {
            msg = JSON.parse(data.toString());
        } catch (err) {
            log.warn(`[agent] Invalid JSON from agent ${this.agentId}`);
            this.ws.close();
            return;
        }

        if (validateIncomingAgentMessage(msg, this.localNodeId)) {
            log.warn(`[agent] Protocol violation from agent ${this.agentId}: ${errors.join('; ')}`);
            this.ws.close();
            return;
        }
    }

    
    sendMessage(msg) {
        const errors = validateAgentMessage(msg, this.localNodeId);
        if (errors) {
            log.warn(`[agent] Protocol violation in sendMessage: ${this.agentId}: ${errors.join('; ')}`);
        } else {
            if (this.ws.readyState === this.ws.OPEN) {
                this.ws.send(JSON.stringify(msg));
            }
        } 
    }

    sendWelcome(nodeId, sessionNonce) {
        const welcomeMsg = {
            type: 'agent_control',
            msg_type: 'welcome',
            payload: {
                node_id: nodeId,
                session_nonce: sessionNonce
            }
        };
        this.sendMessage(welcomeMsg);
    }

    close() {
        if (this.ws.readyState === this.ws.OPEN) {
            this.ws.close();
        }
    }
}

module.exports = { AgentConnection };

