// agentRegistry.js
// Tracks connected special agents and their declared capabilities.

function initialize(config = {}) {
    const agents = new Map();

    function registerAgent(agentId, agentInfo) {
        if (!agentInfo.agentType || !Array.isArray(agentInfo.capabilities)) {
            throw new Error('Invalid agentInfo object');
        }
        agents.set(agentId, {
            agentType: agentInfo.agentType,
            capabilities: agentInfo.capabilities,
        });
    }

    function unregisterAgent(agentId) {
        agents.delete(agentId);
    }

    function getAgentInfo(agentId) {
        return agents.get(agentId) || null;
    }

    function getAgentIds() {
        return Array.from(agents.keys());
    }


    /**
     * Find an agent that supports the given capability.
     * @param {string} capability
     * @returns {string|null} agentId
     */
    function findAgentByCapability(capability) {
        for (const [agentId, info] of agents.entries()) {
            if (info.capabilities.includes(capability)) {
                return agentId;
            }
        }
        return null;
    }

    /**
     * List all connected agents (shallow info only).
     */
    function listAgents() {
        const result = [];
        for (const [agentId, info] of agents.entries()) {
            result.push({
                agentId,
                agentType: info.agentType,
                capabilities: info.capabilities
            });
        }
        return result;
    }

    async function shutdown() {
        agents.clear();
    }

    return {
        registerAgent,
        unregisterAgent,
        getAgentInfo,
        findAgentByCapability,
        listAgents,
        shutdown,
    };
}

module.exports = {
    initialize
};
