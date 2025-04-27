// specialAgentRegistry.js
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
     * @returns {array} agentIds
     */
    function findAgentsByCapability(capability) {
        const matches = [];
        for (const [agentId, info] of agents.entries()) {
            if (info.capabilities.includes(capability)) {
                matches.push(agentId);
            }
        }
        return matches;
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
        findAgentsByCapability,
        listAgents,
        shutdown,
    };
}

module.exports = {
    initialize
};
