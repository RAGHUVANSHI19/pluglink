// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { Account } from '../src/account';
import { AuthProvider } from '../src/lib';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('blocks signup when the password confirmation differs', async () => {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ user: null }))));
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={['/signup']}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider><Account mode="signup" /></AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Full name'), 'Jaipur Driver');
  await user.type(screen.getByLabelText('Email address'), 'jaipur-driver@pluglink.test');
  await user.type(screen.getByLabelText('Mobile number'), '9876500000');
  await user.type(screen.getByLabelText('Password', { exact: true }), 'ExamplePassword!2026');
  await user.type(screen.getByLabelText('Confirm password'), 'DifferentPassword!2026');
  await user.click(screen.getByRole('button', { name: 'Create account' }));

  expect(await screen.findByText('The passwords must match.')).toBeTruthy();
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/auth/me']);
});
