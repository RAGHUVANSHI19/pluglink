import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type Role = "OWNER" | "HOST" | "ADMIN";
export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (typeof options.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch("/api" + path, {
    ...options,
    headers,
    credentials: "same-origin",
  }).catch((cause) => {
    if (cause instanceof DOMException && cause.name === "AbortError")
      throw cause;
    throw new ApiError(
      "Network error. Check your connection and try again.",
      0,
    );
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data?.message === "string" ? data.message : data?.error?.message;
    throw new ApiError(
      message || "We couldn’t complete that request. Please try again.",
      response.status,
    );
  }
  if (data === null)
    throw new ApiError(
      "The server returned an unreadable response.",
      response.status,
    );
  return data as T;
}

type Auth = {
  user: User | null;
  loading: boolean;
  error: Error | null;
  refresh: (user?: User) => Promise<void>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const account = useQuery({
    queryKey: ["auth", "session"],
    queryFn: ({ signal }) => api<{ user: User | null }>("/auth/me", { signal }),
    retry: 1,
    staleTime: 60_000,
  });
  async function refresh(user?: User) {
    if (user) {
      client.setQueryData(["auth", "session"], { user });
      return;
    }
    await account.refetch();
  }
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    await client.cancelQueries();
    client.clear();
    client.setQueryData(["auth", "session"], { user: null });
  }
  return (
    <AuthContext.Provider
      value={{
        user: account.data?.user ?? null,
        loading: account.isPending,
        error: account.error,
        refresh,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("An AuthProvider is required.");
  return auth;
}

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
export function money(paise: number) {
  return currency.format(paise / 100);
}

const dateDisplay = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});
export function dateTime(iso: string | Date) {
  return dateDisplay.format(new Date(iso));
}

export function roleHome(role: Role) {
  return { OWNER: "/owner", HOST: "/host", ADMIN: "/admin" }[role];
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
