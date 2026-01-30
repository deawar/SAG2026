/**
 * WebSocket Client - Real-time Updates
 * Manages WebSocket connection for live bidding updates
 */

class WebSocketClient {
    constructor(url = '') {
        this.url = url || this.getWebSocketURL();
        this.ws = null;
        this.connected = false;
        this.authenticated = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start at 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
        
        // Event handlers
        this.handlers = {
            connect: [],
            disconnect: [],
            error: [],
            message: [],
            bid_update: [],
            auction_status_change: [],
            auction_ending_soon: [],
            user_notification: [],
        };

        // Auto-reconnect settings
        this.autoReconnect = true;
        this.heartbeatInterval = 30000; // 30 seconds
        this.heartbeatTimeout = null;
    }

    /**
     * Get WebSocket URL based on current location
     * @returns {string}
     */
    getWebSocketURL() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}/ws`;
    }

    /**
     * Connect to WebSocket server
     * @returns {Promise}
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.ws) {
                resolve();
                return;
            }

            try {
                this.ws = new WebSocket(this.url);

                this.ws.onopen = () => {
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 1000;
                    
                    console.log('WebSocket connected');
                    this.emit('connect');
                    this.startHeartbeat();
                    
                    // Authenticate if token exists
                    const token = localStorage.getItem('auth_token');
                    if (token) {
                        this.authenticate(token);
                    }
                    
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.emit('error', error);
                    reject(error);
                };

                this.ws.onclose = () => {
                    this.connected = false;
                    this.authenticated = false;
                    this.stopHeartbeat();
                    console.log('WebSocket disconnected');
                    this.emit('disconnect');
                    
                    if (this.autoReconnect) {
                        this.attemptReconnect();
                    }
                };
            } catch (error) {
                console.error('WebSocket connection error:', error);
                this.emit('error', error);
                reject(error);
            }
        });
    }

    /**
     * Attempt to reconnect with exponential backoff
     */
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(
            this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
            this.maxReconnectDelay
        );

        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
            this.connect().catch(() => {
                // Silently fail, attemptReconnect will handle it
            });
        }, delay);
    }

    /**
     * Disconnect from WebSocket
     */
    disconnect() {
        this.autoReconnect = false;
        this.stopHeartbeat();
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        this.connected = false;
        this.authenticated = false;
    }

    /**
     * Handle incoming WebSocket messages
     * @param {string} data - Message data
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            
            // Emit generic message event
            this.emit('message', message);

            // Emit specific event based on type
            if (message.type) {
                switch (message.type) {
                    case 'authenticated':
                        this.authenticated = true;
                        console.log('WebSocket authenticated');
                        break;

                    case 'bid_update':
                        this.emit('bid_update', message.payload);
                        break;

                    case 'auction_status_change':
                        this.emit('auction_status_change', message.payload);
                        break;

                    case 'auction_ending_soon':
                        this.emit('auction_ending_soon', message.payload);
                        break;

                    case 'notification':
                        this.emit('user_notification', message.payload);
                        break;

                    case 'pong':
                        // Heartbeat response
                        break;

                    default:
                        console.warn('Unknown message type:', message.type);
                }
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error, data);
        }
    }

    /**
     * Send message to WebSocket server
     * @param {object} message - Message object
     */
    send(message) {
        if (!this.connected) {
            console.warn('WebSocket not connected');
            return;
        }

        try {
            this.ws.send(JSON.stringify(message));
        } catch (error) {
            console.error('Error sending WebSocket message:', error);
            this.emit('error', error);
        }
    }

    /**
     * Authenticate WebSocket connection
     * @param {string} token - JWT token
     */
    authenticate(token) {
        this.send({
            type: 'authenticate',
            payload: { token },
        });
    }

    /**
     * Subscribe to auction updates
     * @param {string} auctionId - Auction ID
     */
    subscribeAuction(auctionId) {
        this.send({
            type: 'subscribe',
            payload: { 
                resource_type: 'auction',
                resource_id: auctionId,
            },
        });
    }

    /**
     * Unsubscribe from auction updates
     * @param {string} auctionId - Auction ID
     */
    unsubscribeAuction(auctionId) {
        this.send({
            type: 'unsubscribe',
            payload: {
                resource_type: 'auction',
                resource_id: auctionId,
            },
        });
    }

    /**
     * Start heartbeat to keep connection alive
     */
    startHeartbeat() {
        this.heartbeatTimeout = setInterval(() => {
            if (this.connected) {
                this.send({ type: 'ping' });
            }
        }, this.heartbeatInterval);
    }

    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatTimeout) {
            clearInterval(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
    }

    /**
     * Register event handler
     * @param {string} event - Event name
     * @param {function} handler - Handler function
     */
    on(event, handler) {
        if (!this.handlers[event]) {
            this.handlers[event] = [];
        }
        this.handlers[event].push(handler);
    }

    /**
     * Remove event handler
     * @param {string} event - Event name
     * @param {function} handler - Handler function
     */
    off(event, handler) {
        if (!this.handlers[event]) {
            return;
        }
        
        const index = this.handlers[event].indexOf(handler);
        if (index > -1) {
            this.handlers[event].splice(index, 1);
        }
    }

    /**
     * Register one-time event handler
     * @param {string} event - Event name
     * @param {function} handler - Handler function
     */
    once(event, handler) {
        const wrapper = (data) => {
            handler(data);
            this.off(event, wrapper);
        };
        this.on(event, wrapper);
    }

    /**
     * Emit event to all registered handlers
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        if (!this.handlers[event]) {
            return;
        }

        this.handlers[event].forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                console.error(`Error in ${event} handler:`, error);
            }
        });
    }

    /**
     * Get connection status
     * @returns {object}
     */
    getStatus() {
        return {
            connected: this.connected,
            authenticated: this.authenticated,
            url: this.url,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
        };
    }

    /**
     * Wait for connection to be established
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise}
     */
    waitForConnection(timeout = 5000) {
        return new Promise((resolve, reject) => {
            if (this.connected) {
                resolve();
                return;
            }

            const timer = setTimeout(() => {
                this.off('connect', onConnect);
                reject(new Error('Connection timeout'));
            }, timeout);

            const onConnect = () => {
                clearTimeout(timer);
                this.off('connect', onConnect);
                resolve();
            };

            this.on('connect', onConnect);

            // Also try to connect if not already connecting
            if (!this.ws) {
                this.connect().catch(() => {
                    // Connection will be retried
                });
            }
        });
    }

    /**
     * Wait for authentication to complete
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise}
     */
    waitForAuthentication(timeout = 5000) {
        return new Promise((resolve, reject) => {
            if (this.authenticated) {
                resolve();
                return;
            }

            const timer = setTimeout(() => {
                reject(new Error('Authentication timeout'));
            }, timeout);

            const checkAuth = () => {
                if (this.authenticated) {
                    clearTimeout(timer);
                    this.off('message', checkAuth);
                    resolve();
                }
            };

            this.on('message', checkAuth);
        });
    }
}

// Create global instance
window.websocketClient = new WebSocketClient();

// Auto-connect if token exists
if (localStorage.getItem('auth_token')) {
    window.websocketClient.connect().catch(error => {
        console.warn('Failed to auto-connect WebSocket:', error);
    });
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSocketClient;
}
