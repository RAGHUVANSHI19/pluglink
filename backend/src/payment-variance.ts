import type { BookingStatus } from '@prisma/client';

export type PaymentVariance = {
  kind: 'CHARGED_MORE' | 'CHARGED_LESS' | 'INACTIVE_RESERVATION';
  amountPaise: number;
};

export function paymentVariance(
  status: BookingStatus,
  finalPaise: number | null,
  paidPaise: number | null,
): PaymentVariance | null {
  if (paidPaise === null) return null;
  if (status === 'CANCELLED' || status === 'EXPIRED') {
    return { kind: 'INACTIVE_RESERVATION', amountPaise: paidPaise };
  }
  if (status !== 'COMPLETED' || finalPaise === null || finalPaise === paidPaise) return null;
  return {
    kind: paidPaise > finalPaise ? 'CHARGED_MORE' : 'CHARGED_LESS',
    amountPaise: Math.abs(paidPaise - finalPaise),
  };
}
