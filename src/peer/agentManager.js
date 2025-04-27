// peer/agentManager.js
// Manages connected special agents and coordinates requests to them.

const agents = new Map(); 
// Key: agentId (e.g., "remoteAddr:port" or generated UUID)
// Value: AgentConnection instance

function registerAgent(agentId, agentConnection) {
    agents.set(agentId, agentConnection);
}

function unregisterAgent(agentId) {
    agents.delete(agentId);
}

function listAgents() {
    const result = [];
    for (const [agentId, conn] of agents.entries()) {
        result.push({
            agentId,
            agentType: conn.agentType,
            capabilities: conn.capabilities,
        });
    }
    return result;
}

function findAgentByCapability(capability) {
    for (const [agentId, conn] of agents.entries()) {
        if (conn.capabilities.includes(capability)) {
            return conn;
        }
    }
    return null;
}

// EXAMPLE: Request a node ID assignment
async function requestNodeIdAssignment(publicKey) {
    const clusterheadAgent = findAgentByCapability('assign_node_id');
    if (!clusterheadAgent) {
        throw new Error('No clusterhead agent available to assign node_id.');
    }

    const request = {
        type: 'agent_control',
        msg_type: 'assign_node_id',
        payload: { publicKey }
    };

    return clusterheadAgent.sendRequestAndWaitForReply(request);
}

// Future: Add more request types for different agent capabilities

module.exports = {
    registerAgent,
    unregisterAgent,
    listAgents,
    findAgentByCapability,
    requestNodeIdAssignment,
};
