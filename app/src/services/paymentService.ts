import type {
    Payment,
    CreatePaymentRequest,
    PaymentIntentRequest,
    PaymentIntentResponse,
    ProcessCardPaymentRequest,
    RefundRequest,
    Refund
} from '../types/payment';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const paymentService = {
    // ---- Existing: Non-card payments (cash, check, account) ----

    createPayment: async (req: CreatePaymentRequest): Promise<Payment> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!response.ok) throw new Error('Failed to create payment');
        return response.json();
    },

    getHistory: async (invoiceId: string): Promise<Payment[]> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/invoices/${invoiceId}/payments`);
        if (!response.ok) throw new Error('Failed to fetch payments');
        return response.json();
    },

    // ---- Run Payments: Card payment flow ----

    /**
     * Step 1: Create a payment intent to get the Run Payments public key.
     * The public key is used by Runner.js on the frontend to tokenize the card.
     */
    createPaymentIntent: async (req: PaymentIntentRequest): Promise<PaymentIntentResponse> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/payments/intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Payment gateway not available');
        }
        return response.json();
    },

    /**
     * Step 2: Process the card payment using the token from Runner.js.
     * This charges the card through Run Payments and records the payment.
     */
    processCardPayment: async (req: ProcessCardPaymentRequest): Promise<Payment> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/payments/card`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Card payment failed');
        }
        return response.json();
    },

    /**
     * Issue a full or partial refund on a completed card payment.
     */
    refundPayment: async (req: RefundRequest): Promise<Refund> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/payments/refund`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Refund failed');
        }
        return response.json();
    },
};
