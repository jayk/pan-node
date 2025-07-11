const assert = require('assert');
const WebSocket = require('ws');
const { startNode, stopNode } = require('../main.js');
const {
    createVouchsafeIdentity,
    createAttestation,
} = require('vouchsafe');

const uuid = require('uuid');
const NULL_ID = '00000000-0000-0000-0000-000000000000';

const TEST_PEER_PORT = 5874;
const TEST_AGENT_PORT = 5295;

describe('Agent Agent Behavior (Direct Messaging)', function() {
    let wsAgent;
    let connId;
    let nodeId;
    let agentIdentity;
    let loginToken;

    before(async function() {
        await startNode({
            peer_server: { 
                port: TEST_PEER_PORT, 
                trusted_peers_config_file: "trusted_peers.json"
            },
            agent_server: { port: TEST_AGENT_PORT },
            peer_router: {},
            agent_router: {},
            group_manager: {},
            agent_registry: {},
            agent_auth_manager: {
                order: ['local'],
                max_tries: 2,
                timeout_ms: 3000,
                methods: {
                    local: {
                        type: "local",
                        allow_untrusted_agents: true,
                        trusted_agents_config_file: "trusted_agents.json"                                                                                       
                    }   
                }
            },
            logging: { level: 'warn' }
        });
        agentIdentity = await createVouchsafeIdentity('agent-alice');
        loginToken = await createAttestation(agentIdentity.urn, agentIdentity.keypair, {
            purpose: 'agent-connect',
            identifier: 'agent alice'
        });

    });

    after(async function() {
        if (wsAgent && wsAgent.readyState === WebSocket.OPEN) {
            wsAgent.close();
        }
        await stopNode();
    });

    it('should connect and authenticate agent WebSocket', function(done) {
        wsAgent = new WebSocket(`ws://localhost:${TEST_AGENT_PORT}`);

        wsAgent.on('open', () => {
            console.log('Got connection');
            const authMsg = {
                type: 'control',
                msg_type: 'auth',
                msg_id: uuid.v4(),
                from: { node_id: NULL_ID, conn_id: NULL_ID },
                ttl: 1,
                payload: {
                    // whatever minimal fields are needed
                    token: loginToken
                }
            };
            wsAgent.send(JSON.stringify(authMsg));
        });

        wsAgent.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            console.log('agent message', msg);

            if (msg.type === 'control' && msg.msg_type === 'auth.ok') {
                assert.ok(msg.payload.node_id);
                assert.ok(msg.payload.conn_id);

                nodeId = msg.payload.node_id;
                connId = msg.payload.conn_id;

                done();
            }
        });

        wsAgent.on('error', (err) => {
            done(err);
        });
    });

    it('should send a direct message to itself and receive it', function(done) {
        this.timeout(3000);

        const directMsg = {
            type: 'direct',
            msg_id: uuid.v4(),
            from: { node_id: nodeId, conn_id: connId },
            msg_type: 'test.direct',
            payload: { hello: 'self-test' },
            ttl: 5,
            to: { node_id: nodeId, conn_id: connId }
        };

        wsAgent.send(JSON.stringify(directMsg));

        wsAgent.once('message', (data) => {
            const msg = JSON.parse(data.toString());

            assert.strictEqual(msg.type, 'direct');
            assert.strictEqual(msg.msg_type, 'test.direct');
            assert.deepStrictEqual(msg.payload, { hello: 'self-test' });

            done();
        });
    });
});
