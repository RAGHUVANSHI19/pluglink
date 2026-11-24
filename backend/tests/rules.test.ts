import { describe, expect, it } from 'vitest';
import {
  availableSlots,
  calculateCost,
  canTransition,
  dateBounds,
  distanceKm,
  localDate,
  maximumEnergy,
} from '../src/domain-rules.js';
import { requireRole } from '../src/shared.js';
import type { Request } from 'express';

describe('charging price and capacity', () => {
  it('calculates estimates and rounds fractional rupees to the nearest paise', () => {
    expect(calculateCost(10_000, 1_200, 2_000)).toBe(14_000);
    expect(calculateCost(333, 1_001, 0)).toBe(333);
    expect(calculateCost(500, 999, 5)).toBe(505);
    expect(calculateCost(0, 1_200, 2_000)).toBe(2_000);
  });

  it('limits expected energy to the charger power over the slot length', () => {
    const beginning = new Date('2026-11-20T05:00:00Z');
    const end = new Date('2026-11-20T06:00:00Z');
    expect(maximumEnergy(7_400, beginning, end)).toBe(7_400);
    expect(maximumEnergy(3_300, beginning, new Date('2026-11-20T05:30:00Z'))).toBe(1_650);
  });
});

describe('station time and availability', () => {
  const friday = '2026-11-20';
  const schedule = [{ day: 5, startMinute: 480, endMinute: 660 }];

  it('resolves station dates in Asia/Kolkata and rejects impossible dates', () => {
    expect(localDate(new Date('2026-11-19T19:00:00Z'))).toBe(friday);
    expect(dateBounds(friday)?.start.toISOString()).toBe('2026-11-19T18:30:00.000Z');
    expect(dateBounds('2026-02-30')).toBeNull();
  });

  it('removes overlapping slots while allowing adjacent intervals', () => {
    const occupied = [{ start: new Date('2026-11-20T03:30:00Z'), end: new Date('2026-11-20T04:30:00Z') }];
    const slots = availableSlots(friday, schedule, occupied, new Date('2026-11-19T12:00:00Z'));
    expect(slots.map((slot) => slot.start.toISOString())).toEqual([
      '2026-11-20T02:30:00.000Z',
      '2026-11-20T04:30:00.000Z',
    ]);
  });

  it('offers no slots for past, unscheduled, or out-of-horizon dates', () => {
    const now = new Date('2026-11-20T05:00:00Z');
    expect(availableSlots(friday, schedule, [], now)).toEqual([]);
    expect(availableSlots('2026-11-21', schedule, [], now)).toEqual([]);
    expect(availableSlots('2027-01-29', schedule, [], now)).toEqual([]);
  });

  it('distinguishes nearby and distant map coordinates', () => {
    expect(distanceKm(26.9124, 75.7873, 26.9124, 75.7873)).toBe(0);
    expect(distanceKm(26.9124, 75.7873, 28.6139, 77.209)).toBeGreaterThan(200);
  });
});

describe('booking transitions and authorization', () => {
  it('enforces the lifecycle and keeps terminal statuses terminal', () => {
    expect(canTransition('PENDING', 'CONFIRMED')).toBe(true);
    expect(canTransition('PENDING', 'EXPIRED')).toBe(true);
    expect(canTransition('CONFIRMED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(canTransition('PENDING', 'COMPLETED')).toBe(false);
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false);
    expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
  });

  it('requires a matching authenticated role', () => {
    const owner = { id: 'owner', name: 'Owner', email: 'owner@example.test', phone: '9876500000', role: 'OWNER' };
    expect(requireRole({ auth: owner } as Request, 'OWNER')).toEqual(owner);
    expect(() => requireRole({ auth: owner } as Request, 'ADMIN')).toThrow(/does not have access/i);
    expect(() => requireRole({} as Request, 'OWNER')).toThrow(/sign in/i);
  });
});
