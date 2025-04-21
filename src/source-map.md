# 📦 PAN Source Code Map

This document maps out the source code of the PAN server, explaining the purpose of each module and helping developers quickly locate and understand relevant parts of the system.

---

## 🏁 Root Files

| File | Description |
|------|-------------|
| `main.js` | 🔧 Entry point of the PAN node. Initializes configuration, sets up the client and peer servers, and starts the node. |
| `panApp.js` | 🧠 Main application context and shared state between modules. Exposes the `PANApp` object used throughout the system. |
| `config.json5` | ⚙️ The active configuration file for the PAN server, written in JSON5 for comments and relaxed syntax. |
| `config.json5.example` | 📄 A sample config with default or safe values, intended to help new users get started. |
| `persisted_node_id.txt` | 🪪 Stores the node's UUID so it can be reused between restarts, preserving network identity. |

---

## 🧪 Clients

| File | Description |
|------|-------------|
| `clients/pan-test-client-basic.js` | 🧫 Simple example client for testing and development. Demonstrates connecting to the PAN server and sending basic messages. |

---

## 🧠 Core Node Logic

### `node/`

| File/Folder | Description |
|-------------|-------------|
| `panConnection.js` | 🧵 Base class representing a WebSocket connection, shared by both client and peer connections. |

---

## 👥 Client Handling

| File | Description |
|------|-------------|
| `node/client/clientServer.js` | 🌐 WebSocket server for incoming client connections. Manages low-level connection lifecycle. |
| `node/client/clientRegistry.js` | 📋 Tracks all active clients, keyed by their UUIDs. Provides lookup and management utilities. |
| `node/client/clientRouter.js` | 📬 Routes incoming client messages to the appropriate internal handlers or agents. |
| `node/client/clientControl.js` | 🧭 Handles control messages (e.g., joining/leaving groups, metadata updates) from clients. |
| `node/client/groupManager.js` | 👥 Tracks group membership and client participation. Manages join/leave logic and broadcasting. |

---

## 🤝 Peer Node Communication

| File | Description |
|------|-------------|
| `node/peer/peerServer.js` | 🌍 WebSocket server for incoming peer node connections. |
| `node/peer/PeerConnection.js` | 🔌 Represents an individual connection to another PAN node. |
| `node/peer/peerRegistry.js` | 📓 Tracks all connected peer nodes and their states. |
| `node/peer/peerRouter.js` | 🚦 Responsible for routing peer messages and managing inter-node communication. |
| `node/peer/peerServer.js.orig` | 🗃️ Backup or legacy version of `peerServer.js`. (Should probably be reviewed or removed.) |

---

## 🎭 Node Roles and Routing

| File | Description |
|------|-------------|
| `node/roles/clusterMap.js` | 🗺️ Maintains the logical structure of clusters within the PAN network. |
| `node/roles/electionManager.js` | 🗳️ Handles election of clusterheads and other role negotiations between nodes. |
| `node/roles/routingManager.js` | 🚍 Manages high-level message routing strategies between clusters or across peers. |

---

## 🕵️‍♂️ Special Agent Support

| File | Description |
|------|-------------|
| `node/specialAgentRegistry.js` | 🧩 Tracks registered special agents (e.g., authz, storage). Allows nodes to route special messages appropriately. |

---

## 🛠️ Utility Modules

| File | Description |
|------|-------------|
| `utils/jwt.js` | 🔐 Handles JWT validation and creation, including support for special agent authentication. |
| `utils/log.js` | 📣 Unified logging interface. Wraps `console` by default but supports external loggers (e.g., Winston). |
| `utils/spamProtector.js` | 🛡️ Protects against abusive or malformed message patterns from clients or peers. |
| `utils/validators.js` | ✅ Provides schema or value validation logic for inbound messages and configuration. |

---

Let me know if you want to generate links from this for GitHub browsing, or expand this into a `README.md` section for contributors!
