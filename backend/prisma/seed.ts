import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { calculateCost, dateBounds, localDate } from '../src/domain-rules.js';

const prisma = new PrismaClient();
const dayMs = 86_400_000;
const rootCoordinates = [
  ['greencharge', 'GreenCharge Home Station', 'Vaishali Nagar', 7_400, 1_200, 26.911, 75.736, 'Type 2',
    'A covered demo charging bay on the west side of Jaipur, designed for convenient top-ups near Vaishali Nagar.'],
  ['ecovolt', 'EcoVolt Charging Point', 'Mansarovar', 7_400, 1_000, 26.852, 75.753, 'Type 2',
    'An easy-to-reach demo charging stop in Mansarovar with a dedicated parking bay.'],
  ['powernest', 'PowerNest EV Charging', 'Malviya Nagar', 3_300, 900, 26.851, 75.809, '15A Socket',
    'A neighborhood demonstration of low-power charging for compatible portable chargers.'],
  ['chargeease', 'ChargeEase Home Charger', 'Jagatpura', 7_400, 1_100, 26.828, 75.842, 'Type 2',
    'A residential demo charging setup for drivers traveling through south-east Jaipur.'],
  ['urbanvolt', 'UrbanVolt Charging Hub', 'C-Scheme', 11_000, 1_400, 26.913, 75.795, 'CCS2',
    'A demonstration station near central Jaipur with a dedicated charging space and a higher power rating.'],
  ['ecoplug', 'EcoPlug Residential Charging', 'Raja Park', 3_300, 800, 26.892, 75.83, '15A Socket',
    'A sample residential charging bay for compatible portable EV charging equipment.'],
] as const;
const schedule = Array.from({ length: 7 }, (_, day) => ({ day, startMinute: 480, endMinute: 1_320 }));

function startAt(days: number, hour: number) {
  const date = localDate(new Date(Date.now() + days * dayMs));
  return new Date(dateBounds(date)!.start.getTime() + hour * 3_600_000);
}

async function seed() {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo data is available only outside production.');
  const secret = process.env.DEMO_PASSWORD ?? 'PlugLinkDemo2026!';
  if (secret.length < 12 || Buffer.byteLength(secret, 'utf8') > 72) {
    throw new Error('Set a demo password of at least 12 characters and at most 72 UTF-8 bytes.');
  }
  const passwordHash = await bcrypt.hash(secret, 12);
  const accounts = [
    { id: 'demo-owner', name: 'Aarav Sharma', email: 'owner@pluglink.test', phone: '0000000001', role: 'OWNER' },
    { id: 'demo-host', name: 'Priya Verma', email: 'host@pluglink.test', phone: '0000000002', role: 'HOST' },
    { id: 'demo-admin', name: 'PlugLink Admin', email: 'admin@pluglink.test', phone: '0000000003', role: 'ADMIN' },
    { id: 'demo-owner-2', name: 'Dev Mehta', email: 'driver2@pluglink.test', phone: '0000000004', role: 'OWNER' },
  ] as const;
  for (const account of accounts) {
    const existing = await prisma.user.findUnique({ where: { email: account.email }, select: { id: true } });
    if (existing && existing.id !== account.id) throw new Error(`Demo seed email is already in use: ${account.email}`);
    await prisma.user.upsert({
      where: { id: account.id },
      update: { passwordHash },
      create: { ...account, passwordHash },
    });
  }

  const reviewComments = [
    'Sample session. The charging bay was easy to find and the booking went smoothly.',
    'Sample session. The host explained where to park and helped me get started.',
    'Sample session. A convenient stop when visiting the neighborhood.',
    'Sample session. Clear instructions and a straightforward reservation.',
    'Sample session. Booking and arrival were easy during a busy afternoon.',
    'Sample session. A useful option when I only needed a small top-up.',
  ];
  for (const [index, [id, name, locality, powerWatts, pricePaise, latitude, longitude, connector, description]] of rootCoordinates.entries()) {
    const feePaise = 2_000;
    const imageUrls = [`/images/station-${index + 1}.webp`];
    await prisma.chargingStation.upsert({
      where: { id },
      update: {},
      create: {
        id, name, city: 'Jaipur', locality, address: `Illustrative demo bay, ${locality}, Jaipur (fictional address)`,
        description,
        pricePaise, feePaise, latitude, longitude, imageUrls,
        status: 'APPROVED', hostId: 'demo-host', sample: true,
        spec: { create: { chargerType: id === 'urbanvolt' ? 'DC charging' : 'AC home charging', connector, powerWatts } },
        availability: { create: schedule },
        verification: { create: {
          status: 'APPROVED', identityMode: 'DEMO', cctvDeclared: true, electricalDeclared: true,
          termsAccepted: true, evidenceNote: 'Sample listing with a simulated identity review and fictional safety declaration.',
          submittedAt: startAt(-40, 9), reviewedAt: startAt(-39, 12),
        } },
      },
    });
    const bookingId = `demo-session-${id}`;
    const start = startAt(-15 - index, 11);
    const end = new Date(start.getTime() + 3_600_000);
    const totalPaise = calculateCost(3_000, pricePaise, feePaise);
    const actualEnergyWh = 2_600 + index * 60;
    const finalPaise = calculateCost(actualEnergyWh, pricePaise, feePaise);
    const ownerId = index % 2 === 0 ? 'demo-owner' : 'demo-owner-2';
    await prisma.booking.upsert({
      where: { id: bookingId },
      update: {},
      create: {
        id: bookingId, stationId: id, ownerId, hostId: 'demo-host', start, end, expiresAt: start,
        energyWh: 3_000, powerWatts, pricePaise, feePaise, totalPaise, actualEnergyWh, finalPaise,
        status: 'COMPLETED', paymentStatus: 'PAID', sample: true, createdAt: startAt(-17 - index, 10),
        chargingSession: { create: { startedAt: start, endedAt: end, energyWh: actualEnergyWh, meterSource: 'DEMO_MANUAL' } },
        payment: { create: { amountPaise: totalPaise, status: 'PAID', provider: 'DEMO', providerOrderId: `demo-order-${id}` } },
        review: { create: {
          stationId: id, ownerId, rating: index === 2 || index === 5 ? 4 : 5, comment: reviewComments[index]!,
          sample: true, createdAt: end,
        } },
      },
    });
  }

  const upcoming = startAt(2, 17);
  const upcomingId = 'demo-upcoming';
  const upcomingTotal = calculateCost(5_000, 1_200, 2_000);
  await prisma.booking.upsert({
    where: { id: upcomingId },
    update: {},
    create: {
      id: upcomingId, stationId: 'greencharge', ownerId: 'demo-owner', hostId: 'demo-host',
      start: upcoming, end: new Date(upcoming.getTime() + 3_600_000), expiresAt: upcoming,
      energyWh: 5_000, powerWatts: 7_400, pricePaise: 1_200, feePaise: 2_000, totalPaise: upcomingTotal,
      status: 'CONFIRMED', paymentStatus: 'PAID', sample: true,
      payment: { create: { amountPaise: upcomingTotal, status: 'PAID', provider: 'DEMO', providerOrderId: 'demo-order-upcoming' } },
    },
  });
  await prisma.favorite.upsert({
    where: { userId_stationId: { userId: 'demo-owner', stationId: 'greencharge' } },
    update: {},
    create: { userId: 'demo-owner', stationId: 'greencharge' },
  });

  const notice = {
    id: 'demo-upcoming-notice', userId: 'demo-owner', bookingId: upcomingId, kind: 'BOOKING_CONFIRMED',
    title: 'Sample reservation confirmed', message: 'Your demonstration booking at GreenCharge Home Station is confirmed.',
  };
  await prisma.notification.upsert({ where: { id: notice.id }, update: {}, create: notice });

  await prisma.chargingStation.upsert({
    where: { id: 'demo-pending-station' },
    update: {},
    create: {
      id: 'demo-pending-station', hostId: 'demo-host', name: 'Sunlit Demo Charging Bay', city: 'Jaipur',
      locality: 'Vidhyadhar Nagar', address: 'Illustrative bay, Vidhyadhar Nagar, Jaipur (fictional address)',
      description: 'A fictional host listing ready for an administrator to practice reviewing the submission.',
      status: 'PENDING', latitude: 26.963, longitude: 75.781, imageUrls: ['/images/station-4.webp'],
      pricePaise: 1_100, feePaise: 2_000, sample: true,
      spec: { create: { chargerType: 'AC home charging', connector: 'Type 2', powerWatts: 7_400 } },
      availability: { create: schedule },
      verification: { create: {
        status: 'PENDING', identityMode: 'DEMO', cctvDeclared: true, electricalDeclared: true,
        termsAccepted: true, evidenceNote: 'Fictional listing. No identity data or private recordings were collected.',
        submittedAt: new Date(),
      } },
    },
  });
  const submitted = {
    id: 'demo-station-notice', userId: 'demo-host', kind: 'STATION_SUBMITTED', title: 'Sample station awaiting review',
    message: 'Sunlit Demo Charging Bay has been submitted for administrator review.',
  };
  await prisma.notification.upsert({ where: { id: submitted.id }, update: {}, create: submitted });
  console.log('PlugLink development accounts and fictional Jaipur listings are ready.');
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'The demonstration seed failed.');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
