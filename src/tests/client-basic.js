const assert = require('assert');
const WebSocket = require('ws');
const { startNode, stopNode } = require('../main.js');
const uuid = require('uuid');

const TEST_PEER_PORT = 5900;
const TEST_CLIENT_PORT = 5901;

describe('Client Agent Behavior (Direct Messaging)', function() {
    let wsClient;
    let connId;
    let nodeId;

    before(async function() {
        await startNode({
            peer_server: { port: TEST_PEER_PORT },
            client_server: { port: TEST_CLIENT_PORT },
            peer_router: {},
            client_router: {},
            group_manager: {},
            client_registry: {},
            logging: { level: 'warn' }
        });
    });

    after(async function() {
        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
            wsClient.close();
        }
        await stopNode();
    });

    it('should connect and authenticate client WebSocket', function(done) {
        wsClient = new WebSocket(`ws://localhost:${TEST_CLIENT_PORT}`);

        wsClient.on('open', () => {
            console.log('Got connection');
            const authMsg = {
                type: 'control',
                msg_type: 'auth',
                payload: {
                    // whatever minimal fields are needed
                }
            };
            wsClient.send(JSON.stringify(authMsg));
        });

        wsClient.on('message', (data) => {
            const msg = JSON.parse(data.toString());

            if (msg.type === 'control' && msg.msg_type === 'auth.ok') {
                assert.ok(msg.payload.node_id);
                assert.ok(msg.payload.conn_id);

                nodeId = msg.payload.node_id;
                connId = msg.payload.conn_id;

                done();
            }
        });

        wsClient.on('error', (err) => {
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

        wsClient.send(JSON.stringify(directMsg));

        wsClient.once('message', (data) => {
            const msg = JSON.parse(data.toString());

            assert.strictEqual(msg.type, 'direct');
            assert.strictEqual(msg.msg_type, 'test.direct');
            assert.deepStrictEqual(msg.payload, { hello: 'self-test' });

            done();
        });
    });
});
