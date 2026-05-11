/* eslint-disable no-unused-vars */
/**
 * ============================================================================
 * PayPalGateway Unit Tests
 * Tests for @paypal/paypal-server-sdk v2 integration
 * ============================================================================
 */

// Mock function references — declared at module scope BEFORE jest.mock() so
// they are accessible inside the factory (Jest hoists jest.mock() to the top).
let mockCreateOrder, mockCaptureOrder, mockGetCapturedPayment, mockRefundCapturedPayment, mockRequestToken;

jest.mock('@paypal/paypal-server-sdk', () => {
  mockCreateOrder = jest.fn();
  mockCaptureOrder = jest.fn();
  mockGetCapturedPayment = jest.fn();
  mockRefundCapturedPayment = jest.fn();
  mockRequestToken = jest.fn();
  return {
    Client: jest.fn(),
    Environment: { Sandbox: 'sandbox', Production: 'production' },
    OrdersController: jest.fn(() => ({ createOrder: mockCreateOrder, captureOrder: mockCaptureOrder })),
    PaymentsController: jest.fn(() => ({ getCapturedPayment: mockGetCapturedPayment, refundCapturedPayment: mockRefundCapturedPayment })),
    OAuthAuthorizationController: jest.fn(() => ({ requestToken: mockRequestToken }))
  };
});

const { PayPalGateway } = require('../../../src/services/paymentService');
const { Client, Environment, OrdersController, PaymentsController, OAuthAuthorizationController } = require('@paypal/paypal-server-sdk');

const sandboxConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  environment: 'sandbox',
  webhookId: 'test-webhook-id'
};

const productionConfig = {
  clientId: 'prod-client-id',
  clientSecret: 'prod-client-secret',
  environment: 'production',
  webhookId: 'prod-webhook-id'
};

describe('PayPalGateway', () => {
  let gateway;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    gateway = new PayPalGateway(sandboxConfig);
  });

  // ============================================================================
  // constructor
  // ============================================================================
  describe('constructor', () => {
    it('uses Environment.Sandbox when environment is not production', () => {
      new PayPalGateway(sandboxConfig);
      expect(Client).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'sandbox'
        })
      );
    });

    it('uses Environment.Production when environment is production', () => {
      new PayPalGateway(productionConfig);
      expect(Client).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'production'
        })
      );
    });

    it('creates OrdersController with the client', () => {
      expect(OrdersController).toHaveBeenCalled();
    });

    it('creates PaymentsController with the client', () => {
      expect(PaymentsController).toHaveBeenCalled();
    });

    it('creates OAuthAuthorizationController with the client', () => {
      expect(OAuthAuthorizationController).toHaveBeenCalled();
    });

    it('sets sandbox apiBase when not production', () => {
      const gw = new PayPalGateway(sandboxConfig);
      expect(gw.apiBase).toBe('https://api-m.sandbox.paypal.com');
    });

    it('sets production apiBase when environment is production', () => {
      const gw = new PayPalGateway(productionConfig);
      expect(gw.apiBase).toBe('https://api-m.paypal.com');
    });

    it('assigns controllers to instance properties', () => {
      expect(gateway.ordersController).toBeDefined();
      expect(gateway.paymentsController).toBeDefined();
      expect(gateway.oauthController).toBeDefined();
    });

    it('sets apiBase to sandbox URL when environment is not production', () => {
      expect(gateway.apiBase).toBe('https://api-m.sandbox.paypal.com');
    });

    it('sets apiBase to production URL when environment is production', () => {
      const prodGateway = new PayPalGateway({ ...sandboxConfig, environment: 'production' });
      expect(prodGateway.apiBase).toBe('https://api-m.paypal.com');
    });
  });

  // ============================================================================
  // tokenizePaymentMethod
  // ============================================================================
  describe('tokenizePaymentMethod', () => {
    const paymentData = {
      amount: 150.00,
      currency: 'USD',
      description: 'Test auction item',
      returnUrl: 'https://example.com/return',
      cancelUrl: 'https://example.com/cancel',
      metadata: { artworkId: 'artwork-123' }
    };

    it('creates an order and returns token and approvalUrl when approve link is present', async () => {
      mockCreateOrder.mockResolvedValueOnce({
        result: {
          id: 'ORDER-123',
          links: [
            { rel: 'self', href: 'https://api.paypal.com/v2/checkout/orders/ORDER-123' },
            { rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-123' }
          ]
        }
      });

      const result = await gateway.tokenizePaymentMethod(paymentData);

      expect(result).toEqual({
        token: 'ORDER-123',
        approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-123'
      });
    });

    it('returns approvalUrl as null when no approve link is present in response', async () => {
      mockCreateOrder.mockResolvedValueOnce({
        result: {
          id: 'ORDER-456',
          links: [
            { rel: 'self', href: 'https://api.paypal.com/v2/checkout/orders/ORDER-456' }
          ]
        }
      });

      const result = await gateway.tokenizePaymentMethod(paymentData);

      expect(result).toEqual({
        token: 'ORDER-456',
        approvalUrl: null
      });
    });

    it('returns approvalUrl as null when links array is absent', async () => {
      mockCreateOrder.mockResolvedValueOnce({
        result: {
          id: 'ORDER-789'
        }
      });

      const result = await gateway.tokenizePaymentMethod(paymentData);

      expect(result.approvalUrl).toBeNull();
    });

    it('throws PAYPAL_TOKENIZATION_FAILED with message on SDK error', async () => {
      mockCreateOrder.mockRejectedValueOnce(new Error('SDK network failure'));

      await expect(gateway.tokenizePaymentMethod(paymentData))
        .rejects.toThrow('PAYPAL_TOKENIZATION_FAILED: SDK network failure');
    });

    it('calls createOrder with correct body shape', async () => {
      mockCreateOrder.mockResolvedValueOnce({
        result: {
          id: 'ORDER-999',
          links: []
        }
      });

      await gateway.tokenizePaymentMethod(paymentData);

      expect(mockCreateOrder).toHaveBeenCalledWith({
        body: expect.objectContaining({
          intent: 'CAPTURE',
          purchaseUnits: expect.arrayContaining([
            expect.objectContaining({
              referenceId: 'artwork-123',
              amount: { currencyCode: 'USD', value: '150.00' }
            })
          ])
        })
      });
    });
  });

  // ============================================================================
  // chargeCard
  // ============================================================================
  describe('chargeCard', () => {
    const chargeData = {
      token: 'ORDER-123',
      idempotencyKey: 'idem-key-abc'
    };

    const captureDetail = {
      id: 'CAPTURE-001',
      amount: { value: '150.00', currencyCode: 'USD' },
      createTime: '2026-05-07T10:00:00Z'
    };

    const captureOrderResponse = {
      result: {
        id: 'ORDER-123',
        status: 'COMPLETED',
        purchaseUnits: [{
          payments: {
            captures: [captureDetail]
          }
        }]
      }
    };

    it('captures an order and returns normalized transaction data', async () => {
      mockCaptureOrder.mockResolvedValueOnce(captureOrderResponse);

      const result = await gateway.chargeCard(chargeData);

      expect(result).toMatchObject({
        transactionId: 'CAPTURE-001',
        orderId: 'ORDER-123',
        status: 'COMPLETED',
        amount: 150.00,
        currency: 'USD',
        gatewayResponse: captureOrderResponse.result
      });
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('passes idempotencyKey as paypalRequestId to captureOrder', async () => {
      mockCaptureOrder.mockResolvedValueOnce(captureOrderResponse);

      await gateway.chargeCard(chargeData);

      expect(mockCaptureOrder).toHaveBeenCalledWith({
        id: 'ORDER-123',
        paypalRequestId: 'idem-key-abc',
        body: {}
      });
    });

    it('throws PAYPAL_CHARGE_FAILED when captures array is empty', async () => {
      mockCaptureOrder.mockResolvedValueOnce({
        result: {
          id: 'ORDER-123',
          status: 'COMPLETED',
          purchaseUnits: [{
            payments: {
              captures: []
            }
          }]
        }
      });

      await expect(gateway.chargeCard(chargeData))
        .rejects.toThrow('PAYPAL_CHARGE_FAILED: No capture returned from PayPal');
    });

    it('throws PAYPAL_CHARGE_FAILED when captures is missing', async () => {
      mockCaptureOrder.mockResolvedValueOnce({
        result: {
          id: 'ORDER-123',
          status: 'COMPLETED',
          purchaseUnits: [{ payments: {} }]
        }
      });

      await expect(gateway.chargeCard(chargeData))
        .rejects.toThrow('PAYPAL_CHARGE_FAILED: No capture returned from PayPal');
    });

    it('throws PAYPAL_CHARGE_FAILED when purchaseUnits is null', async () => {
      mockCaptureOrder.mockResolvedValueOnce({
        result: { id: 'ORDER-123', status: 'COMPLETED', purchaseUnits: null }
      });
      await expect(gateway.chargeCard({ token: 'ORDER-123', idempotencyKey: 'key-1' }))
        .rejects.toThrow('PAYPAL_CHARGE_FAILED');
    });

    it('throws PAYPAL_CHARGE_FAILED with SDK error message on SDK failure', async () => {
      mockCaptureOrder.mockRejectedValueOnce(new Error('PayPal API unavailable'));

      await expect(gateway.chargeCard(chargeData))
        .rejects.toThrow('PAYPAL_CHARGE_FAILED: PayPal API unavailable');
    });
  });

  // ============================================================================
  // refundCharge
  // ============================================================================
  describe('refundCharge', () => {
    const refundData = {
      transactionId: 'CAPTURE-001',
      amount: 75.00,
      reason: 'Customer request',
      currency: 'USD'
    };

    it('refunds and returns normalized refund data', async () => {
      mockRefundCapturedPayment.mockResolvedValueOnce({
        result: {
          id: 'REFUND-001',
          status: 'COMPLETED',
          amount: { value: '75.00', currencyCode: 'USD' },
          createTime: '2026-05-07T11:00:00Z'
        }
      });

      const result = await gateway.refundCharge(refundData);

      expect(result).toMatchObject({
        refundId: 'REFUND-001',
        status: 'COMPLETED',
        amount: 75.00
      });
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('falls back to input amount when response has no amount field', async () => {
      mockRefundCapturedPayment.mockResolvedValueOnce({
        result: {
          id: 'REFUND-002',
          status: 'COMPLETED',
          createTime: '2026-05-07T11:00:00Z'
          // no amount field
        }
      });

      const result = await gateway.refundCharge(refundData);

      expect(result.amount).toBe(75.00);
    });

    it('uses refundData.currency when provided', async () => {
      mockRefundCapturedPayment.mockResolvedValueOnce({
        result: {
          id: 'REFUND-003',
          status: 'COMPLETED',
          amount: { value: '75.00', currencyCode: 'EUR' },
          createTime: '2026-05-07T11:00:00Z'
        }
      });

      await gateway.refundCharge({ ...refundData, currency: 'EUR' });

      expect(mockRefundCapturedPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            amount: { currencyCode: 'EUR', value: '75.00' }
          })
        })
      );
    });

    it('falls back to USD when no currency is provided in refundData', async () => {
      mockRefundCapturedPayment.mockResolvedValueOnce({
        result: {
          id: 'REFUND-004',
          status: 'COMPLETED',
          createTime: '2026-05-07T11:00:00Z'
        }
      });

      const { currency: _removed, ...refundDataNoCurrency } = refundData;
      await gateway.refundCharge(refundDataNoCurrency);

      expect(mockRefundCapturedPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            amount: { currencyCode: 'USD', value: '75.00' }
          })
        })
      );
    });

    it('throws PAYPAL_REFUND_FAILED with SDK error message on failure', async () => {
      mockRefundCapturedPayment.mockRejectedValueOnce(new Error('Refund not allowed'));

      await expect(gateway.refundCharge(refundData))
        .rejects.toThrow('PAYPAL_REFUND_FAILED: Refund not allowed');
    });

    it('passes transactionId as captureId to refundCapturedPayment', async () => {
      mockRefundCapturedPayment.mockResolvedValueOnce({
        result: { id: 'REFUND-001', status: 'COMPLETED', createTime: '2026-05-10T12:00:00Z' }
      });
      await gateway.refundCharge({ transactionId: 'CAPTURE-001', amount: 50, reason: 'test' });
      expect(mockRefundCapturedPayment).toHaveBeenCalledWith(
        expect.objectContaining({ captureId: 'CAPTURE-001' })
      );
    });
  });

  // ============================================================================
  // getTransactionStatus
  // ============================================================================
  describe('getTransactionStatus', () => {
    it('returns normalized status data for a captured payment', async () => {
      mockGetCapturedPayment.mockResolvedValueOnce({
        result: {
          id: 'CAPTURE-001',
          status: 'COMPLETED',
          amount: { value: '150.00', currencyCode: 'USD' },
          createTime: '2026-05-07T10:00:00Z'
        }
      });

      const result = await gateway.getTransactionStatus('CAPTURE-001');

      expect(result).toMatchObject({
        transactionId: 'CAPTURE-001',
        status: 'COMPLETED',
        amount: 150.00,
        currency: 'USD'
      });
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('calls getCapturedPayment with the correct captureId', async () => {
      mockGetCapturedPayment.mockResolvedValueOnce({
        result: {
          id: 'CAPTURE-XYZ',
          status: 'COMPLETED',
          amount: { value: '200.00', currencyCode: 'USD' },
          createTime: '2026-05-07T10:00:00Z'
        }
      });

      await gateway.getTransactionStatus('CAPTURE-XYZ');

      expect(mockGetCapturedPayment).toHaveBeenCalledWith({ captureId: 'CAPTURE-XYZ' });
    });

    it('throws PAYPAL_STATUS_CHECK_FAILED with SDK error message on failure', async () => {
      mockGetCapturedPayment.mockRejectedValueOnce(new Error('Transaction not found'));

      await expect(gateway.getTransactionStatus('BAD-ID'))
        .rejects.toThrow('PAYPAL_STATUS_CHECK_FAILED: Transaction not found');
    });
  });

  // ============================================================================
  // validateWebhook
  // ============================================================================
  describe('validateWebhook', () => {
    const webhookEvent = {
      id: 'EVT-001',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAPTURE-001', status: 'COMPLETED' }
    };

    const webhookHeaders = {
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/cert123',
      'paypal-cert-id': 'cert-key-id-123',
      'paypal-transmission-id': 'trans-id-456',
      'paypal-transmission-sig': 'sig-789',
      'paypal-transmission-time': '2026-05-07T10:00:00Z'
    };

    beforeEach(() => {
      mockRequestToken.mockResolvedValue({ result: { accessToken: 'mock-access-token' } });
    });

    it('returns eventType, eventId, and data on successful verification', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verification_status: 'SUCCESS' })
      });

      const result = await gateway.validateWebhook(webhookEvent, webhookHeaders);

      expect(result).toEqual({
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        eventId: 'EVT-001',
        data: { id: 'CAPTURE-001', status: 'COMPLETED' }
      });
    });

    it('accepts a JSON string as webhookData', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verification_status: 'SUCCESS' })
      });

      const result = await gateway.validateWebhook(JSON.stringify(webhookEvent), webhookHeaders);

      expect(result.eventType).toBe('PAYMENT.CAPTURE.COMPLETED');
      expect(result.eventId).toBe('EVT-001');
    });

    it('passes paypal-cert-id header as client_cert_key_id in verification request', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verification_status: 'SUCCESS' })
      });

      await gateway.validateWebhook(webhookEvent, webhookHeaders);

      const fetchCall = global.fetch.mock.calls[0];
      const fetchBody = JSON.parse(fetchCall[1].body);
      expect(fetchBody.client_cert_key_id).toBe('cert-key-id-123');
    });

    it('does NOT use paypal-transmission-id as client_cert_key_id', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verification_status: 'SUCCESS' })
      });

      await gateway.validateWebhook(webhookEvent, webhookHeaders);

      const fetchCall = global.fetch.mock.calls[0];
      const fetchBody = JSON.parse(fetchCall[1].body);
      expect(fetchBody.client_cert_key_id).not.toBe('trans-id-456');
    });

    it('throws PAYPAL_WEBHOOK_INVALID: Invalid signature when verification_status is not SUCCESS', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verification_status: 'FAILURE' })
      });

      await expect(gateway.validateWebhook(webhookEvent, webhookHeaders))
        .rejects.toThrow('PAYPAL_WEBHOOK_INVALID: Invalid signature');
    });

    it('throws PAYPAL_WEBHOOK_INVALID with HTTP status when fetch response is not ok', async () => {
      global.fetch.mockResolvedValueOnce({ ok: false, status: 401 });

      await expect(gateway.validateWebhook(webhookEvent, webhookHeaders))
        .rejects.toThrow('PAYPAL_WEBHOOK_INVALID: PayPal verification endpoint returned 401');
    });

    it('throws PAYPAL_WEBHOOK_INVALID on requestToken error', async () => {
      mockRequestToken.mockRejectedValueOnce(new Error('Auth service down'));

      await expect(gateway.validateWebhook(webhookEvent, webhookHeaders))
        .rejects.toThrow('PAYPAL_WEBHOOK_INVALID: Auth service down');
    });

    it('includes webhook_id from config in the verification request', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verification_status: 'SUCCESS' })
      });

      await gateway.validateWebhook(webhookEvent, webhookHeaders);

      const fetchCall = global.fetch.mock.calls[0];
      const fetchBody = JSON.parse(fetchCall[1].body);
      expect(fetchBody.webhook_id).toBe('test-webhook-id');
    });

    it('sends request to sandbox verification URL when not production', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verification_status: 'SUCCESS' })
      });

      await gateway.validateWebhook(webhookEvent, webhookHeaders);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature',
        expect.any(Object)
      );
    });

    it('uses Bearer token in Authorization header for fetch', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verification_status: 'SUCCESS' })
      });

      await gateway.validateWebhook(webhookEvent, webhookHeaders);

      const fetchCall = global.fetch.mock.calls[0];
      expect(fetchCall[1].headers['Authorization']).toBe('Bearer mock-access-token');
    });

    it('includes all required signature fields in the verification request body', async () => {
      mockRequestToken.mockResolvedValueOnce({ result: { accessToken: 'mock-token' } });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verification_status: 'SUCCESS' })
      });
      await gateway.validateWebhook(webhookEvent, webhookHeaders);
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body).toMatchObject({
        auth_algo: webhookHeaders['paypal-auth-algo'],
        cert_url: webhookHeaders['paypal-cert-url'],
        client_cert_key_id: webhookHeaders['paypal-cert-id'],
        transmission_id: webhookHeaders['paypal-transmission-id'],
        transmission_sig: webhookHeaders['paypal-transmission-sig'],
        transmission_time: webhookHeaders['paypal-transmission-time'],
        webhook_id: sandboxConfig.webhookId
      });
    });
  });
});
