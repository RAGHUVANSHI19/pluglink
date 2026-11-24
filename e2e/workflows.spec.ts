import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { localDate } from '../backend/src/domain-rules.js';

const demoPassword = process.env.DEMO_PASSWORD ?? 'PlugLinkDemo2026!';
const localPassword = 'LocalBrowserWorkflow!2026';
const tomorrowInJaipur = (days = 1) => localDate(new Date(Date.now() + days * 86_400_000));

function account(role: 'EV owner' | 'Charging host') {
  const id = randomUUID().slice(0, 8);
  return { role, name: `Browser Test ${id}`, email: `browser-${id}@pluglink.example` };
}

async function signUp(page: Page, user: ReturnType<typeof account>) {
  await page.goto('/signup');
  const form = page.getByRole('main');
  await form.getByLabel('Full name').fill(user.name);
  await form.getByLabel('Email address').fill(user.email);
  await form.getByLabel('Mobile number').fill('9876500000');
  await form.getByLabel('Password', { exact: true }).fill(localPassword);
  await form.getByLabel('Confirm password').fill(localPassword);
  await form.getByRole('radio', { name: user.role }).check();
  await form.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(user.role === 'EV owner' ? /\/owner$/ : /\/host$/);
}

async function logIn(page: Page, email: string, password: string, redirect: RegExp) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(redirect);
}

async function findStation(page: Page, name: string) {
  await page.goto('/chargers');
  await page.getByRole('textbox', { name: 'Search by city, locality, or station' }).fill(name);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
}

async function bookStation(page: Page, name: string) {
  await findStation(page, name);
  await page.getByRole('heading', { name, exact: true }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  await page.getByLabel('Charging date').fill(tomorrowInJaipur(4));
  await page.getByRole('group', { name: 'Available time slots' }).getByRole('radio').first().check();
  await page.getByLabel('Estimated energy (kWh)').fill('1');
  await page.getByRole('button', { name: 'Review booking' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Review your booking' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page).toHaveURL(/\/owner\/bookings\?booking=/);

  const booking = page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) }).first();
  await expect(booking).toBeVisible();
  await booking.getByRole('button', { name: 'Review payment' }).click();
  await booking.getByRole('button', { name: 'Simulate payment' }).click();
  await expect(booking).toContainText('Demo payment recorded');
  return booking;
}

test('an EV owner signs up, discovers a Jaipur charger, reserves, and pays in demo mode', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Charge Smarter. Drive Further.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Featured chargers in Jaipur' })).toBeVisible();
  await expect(page.getByRole('article').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('homepage.png'), animations: 'disabled' });
  const owner = account('EV owner');
  await signUp(page, owner);
  const booking = await bookStation(page, 'GreenCharge Home Station');
  await expect(booking.getByText('Confirmed', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'My bookings' })).toBeVisible();
  await expect(booking.getByText('Confirmed', { exact: true })).toBeVisible();
});

test('a host submits a listing, an admin approves it, and a completed session earns a review', async ({ page: host, browser, baseURL }) => {
  const stationName = `Browser Test Charger ${randomUUID().slice(0, 8)}`;
  const admin = await browser.newPage({ baseURL });
  const owner = await browser.newPage({ baseURL });

  try {
    await signUp(host, account('Charging host'));
    await host.getByRole('button', { name: 'Register a station' }).click();
    await host.getByLabel('Station name').fill(stationName);
    await host.getByLabel('Locality').fill('Test Market');
    await host.getByLabel('Charging location address').fill('Fictional unit for an automated test');
    await host.getByLabel('Facility description').fill('A synthetic EV station for the automated approval and charging workflow.');
    await host.getByLabel('I declare working CCTV is available').check();
    await host.getByLabel('I declare the charger installation meets electrical safety requirements').check();
    await host.getByLabel('I accept the host guidelines and terms').check();
    await host.getByLabel('Identity verification method').selectOption('DEMO');
    await host.getByRole('button', { name: 'Save and submit for verification' }).click();
    const hostStation = host.getByRole('article').filter({ has: host.getByRole('heading', { name: stationName, exact: true }) });
    await expect(hostStation).toContainText(/Pending/i);

    await findStation(owner, stationName);
    await expect(owner.getByRole('heading', { name: 'No stations match your search' })).toBeVisible();

    await logIn(admin, 'admin@pluglink.test', demoPassword, /\/admin$/);
    await admin.goto('/admin?tab=stations');
    const adminStation = admin.getByRole('article').filter({ has: admin.getByRole('heading', { name: stationName, exact: true }) });
    await adminStation.getByRole('button', { name: 'Approve', exact: true }).click();
    await admin.getByRole('button', { name: 'Confirm approval' }).click();
    await expect(adminStation).toContainText(/Approved/i);

    await signUp(owner, account('EV owner'));
    const booking = await bookStation(owner, stationName);

    await host.goto('/host?tab=bookings');
    const hostBooking = host.getByRole('article').filter({ has: host.getByRole('heading', { name: stationName, exact: true }) });
    await hostBooking.getByRole('button', { name: 'Start session' }).click();
    await hostBooking.getByRole('button', { name: 'Record energy and complete' }).click();
    await hostBooking.getByLabel('Actual charging energy (kWh)').fill('1');
    await hostBooking.getByRole('button', { name: 'Complete session' }).click();
    await expect(hostBooking).toContainText(/Completed/i);
    await host.goto('/host?tab=earnings');
    await expect(host.getByRole('heading', { name: 'Delivered energy by month' })).toBeVisible();
    await expect(host.getByRole('row').filter({ hasText: stationName })).toContainText('1 kWh');

    await owner.reload();
    await booking.getByRole('button', { name: 'Write a review' }).click();
    await booking.getByLabel('Rating').selectOption('5');
    await booking.getByLabel('Review', { exact: true }).fill('The host made this automated charging session easy to use.');
    await booking.getByRole('button', { name: 'Publish review' }).click();
    await expect(booking).toContainText('Review submitted');
  } finally {
    await Promise.all([admin.close(), owner.close()]);
  }
});

test('mobile navigation opens the charger catalog without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open menu' });
  await expect(menu).toBeVisible();
  await menu.click();
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation).toBeVisible();
  await navigation.getByRole('link', { name: 'Find Chargers' }).click();
  await expect(page).toHaveURL(/\/chargers$/);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
});

test('public information and policy routes show their requested content', async ({ page }) => {
  const pages: Array<[string, string]> = [
    ['/how-it-works', 'How PlugLink works'],
    ['/become-a-host', 'Share your charger with local EV drivers'],
    ['/about', 'About PlugLink'],
    ['/support', 'Contact & Support'],
    ['/faq', 'Frequently asked questions'],
    ['/legal/privacy', 'Privacy Policy'],
    ['/legal/terms', 'Terms and Conditions'],
    ['/legal/host', 'Host Guidelines'],
    ['/legal/safety', 'Safety Guidelines'],
  ];
  for (const [url, title] of pages) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
  }
});
