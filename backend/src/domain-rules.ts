import type { BookingStatus } from '@prisma/client';

export const SLOT_MINUTES = 60;
export const MAX_ADVANCE_DAYS = 60;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const IST_OFFSET_MS = 330 * MINUTE_MS;

export function localDate(value: Date): string {
  return new Date(value.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function dateBounds(date: string): { start: Date; end: Date; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = new Date(`${date}T00:00:00+05:30`);
  if (!Number.isFinite(start.getTime()) || localDate(start) !== date) return null;
  return {
    start,
    end: new Date(start.getTime() + DAY_MS),
    day: new Date(`${date}T00:00:00Z`).getUTCDay(),
  };
}

export function bookingHorizon(now: Date): Date {
  return new Date(dateBounds(localDate(now))!.end.getTime() + (MAX_ADVANCE_DAYS - 1) * DAY_MS);
}

export function calculateCost(energyWh: number, pricePaise: number, feePaise: number): number {
  const energyCost = (BigInt(energyWh) * BigInt(pricePaise) + 500n) / 1_000n;
  return Number(energyCost + BigInt(feePaise));
}

export function maximumEnergy(powerWatts: number, start: Date, end: Date): number {
  return Math.floor(powerWatts * (end.getTime() - start.getTime()) / 3_600_000);
}

export type TimeRange = { start: Date; end: Date };
export type WeeklyRange = { day: number; startMinute: number; endMinute: number };

export function overlaps(first: TimeRange, second: TimeRange): boolean {
  return first.start < second.end && second.start < first.end;
}

export function availableSlots(
  date: string,
  schedule: WeeklyRange[],
  occupied: TimeRange[],
  now: Date,
): TimeRange[] {
  const bounds = dateBounds(date);
  if (!bounds || bounds.end <= now || bounds.start >= bookingHorizon(now)) return [];

  const slots: TimeRange[] = [];
  for (const window of schedule.filter((entry) => entry.day === bounds.day)) {
    for (let minute = window.startMinute; minute + SLOT_MINUTES <= window.endMinute; minute += SLOT_MINUTES) {
      const slot = {
        start: new Date(bounds.start.getTime() + minute * MINUTE_MS),
        end: new Date(bounds.start.getTime() + (minute + SLOT_MINUTES) * MINUTE_MS),
      };
      if (slot.start > now && !occupied.some((range) => overlaps(slot, range))) slots.push(slot);
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function hasScheduledSlot(
  schedule: WeeklyRange[],
  occupied: TimeRange[],
  now: Date,
): boolean {
  const firstDay = dateBounds(localDate(now))!.start;
  for (let day = 0; day < 60; day += 1) {
    const date = localDate(new Date(firstDay.getTime() + day * DAY_MS));
    if (availableSlots(date, schedule, occupied, now).length > 0) return true;
  }
  return false;
}

export function canTransition(current: BookingStatus, next: BookingStatus): boolean {
  switch (current) {
    case 'PENDING': return next === 'CONFIRMED' || next === 'CANCELLED' || next === 'EXPIRED';
    case 'CONFIRMED': return next === 'IN_PROGRESS' || next === 'CANCELLED';
    case 'IN_PROGRESS': return next === 'COMPLETED';
    default: return false;
  }
}

export function distanceKm(latitude: number, longitude: number, targetLat: number, targetLng: number): number {
  const radians = Math.PI / 180;
  const dLat = (targetLat - latitude) * radians;
  const dLng = (targetLng - longitude) * radians;
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(latitude * radians) * Math.cos(targetLat * radians) * Math.sin(dLng / 2) ** 2;
  return Math.round(12_742 * Math.asin(Math.sqrt(Math.min(1, haversine))) * 10) / 10;
}
