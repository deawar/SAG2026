/**
 * Real-time Service
 * Manages WebSocket connections, event broadcasting, and live updates
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

class RealtimeService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // Map of userId -> Set of WebSocket connections
    this.subscriptions = new Map(); // Map of userId -> Set of subscribed auction/artwork IDs
    this.eventHistory = new Map(); // Store recent events for new connections
  }

  /**
   * Initialize WebSocket server
   * @param {http.Server} server - Express server instance
   */
  initializeWebSocketServer(server) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });

    this.wss.on('connection', (ws) => {
      console.log('New WebSocket connection');

      // Handle incoming messages
      ws.on('message', (message) => this._handleMessage(ws, message));

      // Handle disconnection
      ws.on('close', () => this._handleDisconnect(ws));

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connection',
        status: 'connected',
        timestamp: new Date(),
        message: 'Welcome to Silent Auction Gallery real-time updates'
      }));
    });

    console.log('WebSocket server initialized');
  }

  /**
   * Handle incoming WebSocket messages
   * @private
   */
  _handleMessage(ws, message) {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'authenticate':
          this._handleAuthenticate(ws, data);
          break;
        case 'subscribe':
          this._handleSubscribe(ws, data);
          break;
        case 'unsubscribe':
          this._handleUnsubscribe(ws, data);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date() }));
          break;
        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${data.type}`
          }));
      }
    } catch (error) {
      console.error('Message handling error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  }

  /**
   * Handle authentication message
   * Accepts { type: 'authenticate', payload: { token } } from websocket-client.js
   * @private
   */
  _handleAuthenticate(ws, data) {
    const token = data.payload?.token || data.token;

    if (!token) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Authentication token required'
      }));
      return;
    }

    let userId;
    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
      userId = decoded.sub;
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid or expired authentication token'
      }));
      return;
    }

    if (!userId) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'User ID not found in token'
      }));
      return;
    }

    // Associate WebSocket connection with user
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId).add(ws);

    // Store user ID on WebSocket object
    ws.userId = userId;
    ws.authenticatedAt = new Date();

    // Initialize subscription set if needed
    if (!this.subscriptions.has(userId)) {
      this.subscriptions.set(userId, new Set());
    }

    ws.send(JSON.stringify({
      type: 'authenticated',
      userId,
      timestamp: new Date(),
      message: `Authenticated as user ${userId}`
    }));

    console.log(`User ${userId} authenticated via WebSocket`);
  }

  /**
   * Handle subscription to auction/artwork updates
   * @private
   */
  _handleSubscribe(ws, data) {
    if (!ws.userId) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Must authenticate before subscribing'
      }));
      return;
    }

    // Accept both direct format ({ auctionId }) and payload format ({ payload: { resource_id } })
    const auctionId = data.auctionId || (data.payload?.resource_type === 'auction' ? data.payload?.resource_id : undefined);
    const artworkId = data.artworkId || (data.payload?.resource_type === 'artwork' ? data.payload?.resource_id : undefined);
    const resourceId = auctionId || artworkId || data.payload?.resource_id;

    if (!resourceId) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Auction ID or Artwork ID required'
      }));
      return;
    }

    const subscriptions = this.subscriptions.get(ws.userId);
    subscriptions.add(resourceId);

    // Send subscription confirmation with recent history
    const history = this.eventHistory.get(resourceId) || [];

    ws.send(JSON.stringify({
      type: 'subscribed',
      resourceId,
      timestamp: new Date(),
      recentEvents: history.slice(-10), // Last 10 events
      message: `Subscribed to updates for ${auctionId ? 'auction' : 'artwork'} ${resourceId}`
    }));

    console.log(`User ${ws.userId} subscribed to ${resourceId}`);
  }

  /**
   * Handle unsubscription from auction/artwork updates
   * @private
   */
  _handleUnsubscribe(ws, data) {
    if (!ws.userId) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Must authenticate before unsubscribing'
      }));
      return;
    }

    const auctionId = data.auctionId || (data.payload?.resource_type === 'auction' ? data.payload?.resource_id : undefined);
    const artworkId = data.artworkId || (data.payload?.resource_type === 'artwork' ? data.payload?.resource_id : undefined);
    const resourceId = auctionId || artworkId || data.payload?.resource_id;

    if (!resourceId) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Auction ID or Artwork ID required'
      }));
      return;
    }

    const subscriptions = this.subscriptions.get(ws.userId);
    subscriptions.delete(resourceId);

    ws.send(JSON.stringify({
      type: 'unsubscribed',
      resourceId,
      timestamp: new Date(),
      message: `Unsubscribed from ${auctionId ? 'auction' : 'artwork'} ${resourceId}`
    }));

    console.log(`User ${ws.userId} unsubscribed from ${resourceId}`);
  }

  /**
   * Handle WebSocket disconnection
   * @private
   */
  _handleDisconnect(ws) {
    if (ws.userId) {
      const userConnections = this.clients.get(ws.userId);
      if (userConnections) {
        userConnections.delete(ws);
        if (userConnections.size === 0) {
          this.clients.delete(ws.userId);
        }
      }
      console.log(`User ${ws.userId} disconnected`);
    }
  }

  /**
   * Broadcast bid event to interested clients
   * @param {string} artworkId - ID of artwork
   * @param {Object} bidData - Bid information
   */
  broadcastBidUpdate(artworkId, bidData) {
    const event = {
      type: 'bid_update',
      artworkId,
      data: bidData,
      timestamp: new Date()
    };

    // Store in history
    if (!this.eventHistory.has(artworkId)) {
      this.eventHistory.set(artworkId, []);
    }
    const history = this.eventHistory.get(artworkId);
    history.push(event);
    if (history.length > 50) {history.shift();} // Keep last 50 events

    // Broadcast to all subscribed clients
    this.clients.forEach((connections, userId) => {
      const subscriptions = this.subscriptions.get(userId) || new Set();
      if (subscriptions.has(artworkId)) {
        connections.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(event));
          }
        });
      }
    });

    console.log(`Broadcasted bid update for artwork ${artworkId}`);
  }

  /**
   * Broadcast auction status change
   * @param {string} auctionId - ID of auction
   * @param {string} status - New status
   * @param {Object} details - Additional details
   */
  broadcastAuctionStatusChange(auctionId, status, details = {}) {
    const event = {
      type: 'auction_status_change',
      auctionId,
      status,
      details,
      timestamp: new Date()
    };

    // Store in history
    if (!this.eventHistory.has(auctionId)) {
      this.eventHistory.set(auctionId, []);
    }
    const history = this.eventHistory.get(auctionId);
    history.push(event);
    if (history.length > 50) {history.shift();}

    // Broadcast to all subscribed clients
    this.clients.forEach((connections, userId) => {
      const subscriptions = this.subscriptions.get(userId) || new Set();
      if (subscriptions.has(auctionId)) {
        connections.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(event));
          }
        });
      }
    });

    console.log(`Broadcasted auction status change for ${auctionId}: ${status}`);
  }

  /**
   * Broadcast auction ending soon notification
   * @param {string} auctionId - ID of auction
   * @param {number} timeRemaining - Milliseconds remaining
   */
  broadcastAuctionEndingSoon(auctionId, timeRemaining) {
    const event = {
      type: 'auction_ending_soon',
      auctionId,
      timeRemaining,
      timestamp: new Date()
    };

    this.clients.forEach((connections, userId) => {
      const subscriptions = this.subscriptions.get(userId) || new Set();
      if (subscriptions.has(auctionId)) {
        connections.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(event));
          }
        });
      }
    });
  }

  /**
   * Send notification to specific user
   * @param {string} userId - ID of user
   * @param {string} notificationType - Type of notification
   * @param {Object} data - Notification data
   */
  notifyUser(userId, notificationType, data = {}) {
    const event = {
      type: 'notification',
      notificationType,
      data,
      timestamp: new Date()
    };

    const connections = this.clients.get(userId);
    if (connections) {
      connections.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(event));
        }
      });
    }
  }

  /**
   * Broadcast to all connected users
   * @param {Object} event - Event to broadcast
   */
  broadcastToAll(event) {
    event.timestamp = new Date();

    this.clients.forEach((connections) => {
      connections.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(event));
        }
      });
    });
  }

  /**
   * Get connection statistics
   */
  getStats() {
    const totalConnections = Array.from(this.clients.values()).reduce(
      (sum, set) => sum + set.size,
      0
    );

    return {
      connectedUsers: this.clients.size,
      totalConnections,
      activeSubscriptions: this.subscriptions.size,
      eventHistorySize: this.eventHistory.size
    };
  }

  /**
   * Close WebSocket server
   */
  shutdown() {
    if (this.wss) {
      this.wss.close(() => {
        console.log('WebSocket server shut down');
      });
    }
  }
}

module.exports = new RealtimeService();
