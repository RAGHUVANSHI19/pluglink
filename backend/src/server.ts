import 'dotenv/config';
import { createApp } from './app.js';
import { materializeUpcomingReminders } from './operations.js';
import { prisma } from './shared.js';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) throw new Error('PORT must be a valid TCP port.');

const server = createApp().listen(port, () => {
  console.info(`PlugLink API listening on port ${port}`);
});

async function checkReminders() {
  try {
    await materializeUpcomingReminders();
  } catch {
    console.warn('PlugLink could not check upcoming session reminders.');
  }
}

const reminderTimer = setInterval(() => void checkReminders(), 60_000);
reminderTimer.unref();
void checkReminders();

function close() {
  clearInterval(reminderTimer);
  server.close(() => void prisma.$disconnect());
}

process.once('SIGINT', close);
process.once('SIGTERM', close);
