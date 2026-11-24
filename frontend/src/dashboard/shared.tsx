import { type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  Inbox,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import { api } from "../lib";
import "./dashboard.css";

export type Role = "OWNER" | "HOST" | "ADMIN";
export type StationStatus =
  "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "EXPIRED";

export interface Booking {
  id: string;
  stationId: string;
  stationName: string;
  locality: string;
  start: string;
  end: string;
  energyWh: number;
  pricePaise: number;
  feePaise: number;
  totalPaise: number;
  actualEnergyWh: number | null;
  finalPaise: number | null;
  status: BookingStatus;
  paymentStatus: string;
  sample: boolean;
  createdAt: string;
  cancelledAt: string | null;
  reviewId: string | null;
  ownerName?: string;
  hostName?: string;
  expiresAt?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  paidPaise?: number | null;
  paymentProvider?: string | null;
  cancellationReason?: string | null;
}

export interface Station {
  id: string;
  name: string;
  city: string;
  locality: string;
  address: string;
  description: string;
  connector: string;
  powerKw: number;
  pricePaise: number;
  feePaise: number;
  latitude: number;
  longitude: number;
  imageUrls: string[];
  sample: boolean;
  hostName: string;
  rating: number | null;
  reviewCount: number;
  available: boolean;
  status: StationStatus;
}

export function titleCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (char) => char.toUpperCase());
}

export function roleLabel(role: Role) {
  return { OWNER: "EV owner", HOST: "Charging host", ADMIN: "Administrator" }[
    role
  ];
}

export function send<T>(
  path: string,
  method: string,
  payload?: unknown,
): Promise<T> {
  return api<T>(path, {
    method,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

export function dashboardError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Try again.";
}

export function Notice({
  children,
  success = false,
}: {
  children: ReactNode;
  success?: boolean;
}) {
  return (
    <div
      className={`db-notice${success ? " db-notice-success" : ""}`}
      role={success ? "status" : "alert"}
    >
      {!success && <AlertCircle size={17} aria-hidden="true" />}
      {children}
    </div>
  );
}

export function Loading() {
  return (
    <div className="db-loading" role="status">
      <LoaderCircle size={21} aria-hidden="true" /> Loading your data…
    </div>
  );
}

export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="db-empty">
      <Inbox aria-hidden="true" size={25} />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Header({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <header className="db-header">
      <div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {action && <div className="db-header-action">{action}</div>}
    </header>
  );
}

export function Section({
  title,
  text,
  action,
  children,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="db-section">
      <div className="db-section-heading">
        <div>
          <h2>{title}</h2>
          {text && <p>{text}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Badge({ value }: { value: string }) {
  const style = [
    "APPROVED",
    "ACTIVE",
    "CONFIRMED",
    "COMPLETED",
    "PAID",
    "CAPTURED",
  ].includes(value)
    ? "good"
    : [
          "PENDING",
          "PENDING_VERIFICATION",
          "IN_PROGRESS",
          "CREATED",
          "UNPAID",
        ].includes(value)
      ? "waiting"
      : ["CANCELLED", "SUSPENDED", "REJECTED", "FAILED"].includes(value)
        ? "negative"
        : "normal";
  return (
    <span className={`db-badge db-badge-${style}`}>{titleCase(value)}</span>
  );
}

export function Stat({
  label,
  value,
  icon: Icon,
  detail,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  detail?: string;
}) {
  return (
    <div className="db-stat">
      <div className="db-stat-top">
        <span>{label}</span>
        <span className="db-stat-icon">
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
      <strong>{value}</strong>
      {detail && <p>{detail}</p>}
    </div>
  );
}

export function DashboardNav({
  items,
  selected,
  onSelect,
}: {
  items: { id: string; label: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Dashboard sections" className="db-tabs">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={selected === item.id ? "page" : undefined}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function useDashboardTab(fallback: string, allowed: string[]) {
  const [search, setSearch] = useSearchParams();
  const selected = search.get("tab");
  return [
    selected && allowed.includes(selected) ? selected : fallback,
    (tab: string) => {
      setSearch((current) => {
        const next = new URLSearchParams(current);
        if (tab === fallback) next.delete("tab");
        else next.set("tab", tab);
        return next;
      });
    },
  ] as const;
}

export function ActionLink({
  to,
  children,
  secondary = false,
}: {
  to: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`db-button${secondary ? " db-button-secondary" : ""}`}
    >
      {children}
    </Link>
  );
}
