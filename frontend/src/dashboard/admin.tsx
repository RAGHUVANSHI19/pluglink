import { useDeferredValue, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Flag,
  PlugZap,
  ShieldCheck,
  Store,
  UsersRound,
} from "lucide-react";
import { api, dateTime, money } from "../lib";
import { type DashboardReview, type HostStation } from "./host";
import {
  Badge,
  DashboardNav,
  Empty,
  Header,
  Loading,
  Notice,
  Section,
  Stat,
  dashboardError,
  roleLabel,
  send,
  titleCase,
  useDashboardTab,
  type Booking,
  type Role,
} from "./shared";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "stations", label: "Stations & verification" },
  { id: "users", label: "Users" },
  { id: "bookings", label: "Bookings & payments" },
  { id: "issues", label: "Reported issues" },
];
const statusGroups = {
  station: ["PENDING", "APPROVED", "DRAFT", "REJECTED", "SUSPENDED"],
  user: ["OWNER", "HOST", "ADMIN"],
  booking: [
    "PENDING",
    "CONFIRMED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
    "EXPIRED",
  ],
};
const countKey = ["dashboard", "admin", "counts"];
const stationsKey = ["dashboard", "admin", "stations"];
const usersKey = ["dashboard", "admin", "users"];
const supportKey = ["dashboard", "admin", "support"];
const issuesKey = ["dashboard", "admin", "issues"];
const pageSize = 20;

type Counts = {
  users: number;
  hosts: number;
  pending: number;
  active: number;
  bookings: number;
  completed: number;
  payments: number;
  issues: number;
};
interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
}
interface SupportRequest {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
}

export function Admin() {
  const [tab, select] = useDashboardTab(
    "overview",
    tabs.map((item) => item.id),
  );
  const counts = useQuery({
    queryKey: countKey,
    queryFn: () => api<{ counts: Counts }>("/admin/overview"),
  });
  const values = counts.data?.counts;
  return (
    <div className="db-page">
      <div className="db-wrap">
        <Header
          title="Administration"
          text="Review listings, manage accounts, and oversee charging activity."
          action={
            <span className="db-admin-badge">
              <ShieldCheck size={17} aria-hidden="true" /> Administrator
            </span>
          }
        />
        <DashboardNav items={tabs} selected={tab} onSelect={select} />
        {tab === "overview" && (
          <>
            {counts.isPending && <Loading />}
            {counts.isError && <Notice>{dashboardError(counts.error)}</Notice>}
            {values && (
              <div className="db-stats">
                <Stat
                  label="Registered users"
                  value={values.users}
                  icon={UsersRound}
                />
                <Stat
                  label="Charging hosts"
                  value={values.hosts}
                  icon={Store}
                />
                <Stat
                  label="Pending station reviews"
                  value={values.pending}
                  icon={ClipboardList}
                />
                <Stat
                  label="Active stations"
                  value={values.active}
                  icon={PlugZap}
                />
                <Stat
                  label="Total bookings"
                  value={values.bookings}
                  icon={CalendarDays}
                />
                <Stat
                  label="Completed sessions"
                  value={values.completed}
                  icon={CheckCircle2}
                />
                <Stat
                  label="Payment records"
                  value={values.payments}
                  icon={CircleDollarSign}
                />
                <Stat label="Open issues" value={values.issues} icon={Flag} />
              </div>
            )}
            <div className="db-cols">
              <Section
                title="Station verification"
                text="Review charging facilities and safety declarations before approving a listing."
              >
                <button
                  className="db-button"
                  onClick={() => select("stations")}
                >
                  Review stations
                </button>
              </Section>
              <Section
                title="Support and review reports"
                text="Read support requests and moderate reported reviews."
              >
                <button
                  className="db-button db-button-secondary"
                  onClick={() => select("issues")}
                >
                  Review issues
                </button>
              </Section>
            </div>
          </>
        )}
        {tab === "stations" && <AdminStations />}
        {tab === "users" && <AdminUsers />}
        {tab === "bookings" && <AdminBookings />}
        {tab === "issues" && <AdminIssues />}
      </div>
    </div>
  );
}

function useSearchFilter(defaultStatus = "") {
  const [text, setText] = useState("");
  const [status, setStatus] = useState(defaultStatus);
  const [page, setPage] = useState(1);
  const query = useDeferredValue(text.trim());
  return {
    text,
    status,
    page,
    setPage,
    query,
    setText: (next: string) => {
      setPage(1);
      setText(next);
    },
    setStatus: (next: string) => {
      setPage(1);
      setStatus(next);
    },
  };
}

function resultPath(
  path: string,
  query: string,
  page: number,
  statusKey: string,
  status: string,
) {
  const search = new URLSearchParams({
    limit: String(pageSize),
    offset: String((page - 1) * pageSize),
  });
  if (query) search.set("q", query);
  if (status) search.set(statusKey, status);
  return `${path}?${search}`;
}

function SearchControls({
  state,
  group,
  textLabel,
  statusLabel,
}: {
  state: ReturnType<typeof useSearchFilter>;
  group: keyof typeof statusGroups;
  textLabel: string;
  statusLabel: string;
}) {
  return (
    <div className="db-search-tools">
      <label className="db-field">
        {textLabel}
        <input
          value={state.text}
          maxLength={100}
          onChange={(event) => state.setText(event.target.value)}
          type="search"
        />
      </label>
      <label className="db-field">
        {statusLabel}
        <select
          value={state.status}
          onChange={(event) => state.setStatus(event.target.value)}
        >
          <option value="">
            {group === "user" ? "All roles" : "All statuses"}
          </option>
          {statusGroups[group].map((value) => (
            <option key={value} value={value}>
              {group === "user"
                ? roleLabel(value as Role)
                : group === "station" && value === "PENDING"
                  ? "Pending verification"
                  : titleCase(value)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Pagination({
  page,
  total,
  limit,
  onPage,
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (value: number) => void;
}) {
  const maxPage = Math.max(1, Math.ceil(total / limit));
  if (maxPage === 1 && page === 1) return null;
  return (
    <nav className="db-pagination" aria-label="Results pages">
      <button
        className="db-button db-button-secondary"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page} of {maxPage}
      </span>
      <button
        className="db-button db-button-secondary"
        disabled={page >= maxPage}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}

function AdminStations() {
  const filter = useSearchFilter();
  const query = useQuery({
    queryKey: [...stationsKey, filter.query, filter.status, filter.page],
    queryFn: ({ signal }) =>
      api<{ stations: HostStation[]; total: number }>(
        resultPath(
          "/admin/stations",
          filter.query,
          filter.page,
          "status",
          filter.status,
        ),
        { signal },
      ),
  });
  return (
    <Section
      title="Stations and verification"
      text="Review location, charger details, and private safety declarations."
    >
      <SearchControls
        state={filter}
        group="station"
        textLabel="Search stations"
        statusLabel="Listing status"
      />
      {query.isPending && <Loading />}
      {query.isError && <Notice>{dashboardError(query.error)}</Notice>}
      {query.data && (
        <>
          {query.data.stations.length ? (
            <div className="db-admin-list">
              {query.data.stations.map((station) => (
                <AdminStationRow key={station.id} station={station} />
              ))}
            </div>
          ) : (
            <Empty
              title="No matching stations"
              text="Try another name, locality, or listing status."
            />
          )}
          <Pagination
            page={filter.page}
            total={query.data.total}
            limit={pageSize}
            onPage={filter.setPage}
          />
        </>
      )}
    </Section>
  );
}

const stationActions = {
  APPROVED: "Approve",
  REJECTED: "Reject",
  SUSPENDED: "Suspend",
} as const;
function AdminStationRow({ station }: { station: HostStation }) {
  const client = useQueryClient();
  const [decision, setDecision] = useState<keyof typeof stationActions | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const update = useMutation({
    mutationFn: (input: {
      status: keyof typeof stationActions;
      reason?: string;
    }) => send(`/admin/stations/${station.id}`, "PATCH", input),
    onSuccess: (_data, input) => {
      setDecision(null);
      setNotice(`Listing ${titleCase(input.status).toLowerCase()}.`);
      void client.invalidateQueries({ queryKey: stationsKey });
      void client.invalidateQueries({ queryKey: countKey });
      void client.invalidateQueries({ queryKey: ["stations"] });
      void client.invalidateQueries({ queryKey: ["station", station.id] });
      void client.invalidateQueries({
        queryKey: ["station-slots", station.id],
      });
    },
  });
  const allowedActions =
    station.status === "PENDING"
      ? (["APPROVED", "REJECTED", "SUSPENDED"] as const)
      : station.status === "APPROVED"
        ? (["SUSPENDED"] as const)
        : station.status === "SUSPENDED"
          ? (["APPROVED"] as const)
          : [];
  const open = (status: keyof typeof stationActions) => {
    setNotice("");
    update.reset();
    setDecision(status);
  };
  const verified = station.verification;
  return (
    <article className="db-admin-row">
      <div>
        <h3>{station.name}</h3>
        <p>
          {station.locality}, {station.city} · {station.hostName}
          {station.sample ? " · Sample station" : ""}
        </p>
      </div>
      <div className="db-actions">
        <Badge
          value={
            station.status === "PENDING"
              ? "PENDING_VERIFICATION"
              : station.status
          }
        />
        {allowedActions.map((status) => (
          <button
            type="button"
            key={status}
            className={`db-button${status === "APPROVED" ? "" : " db-button-secondary"}`}
            onClick={() => open(status)}
          >
            {stationActions[status]}
          </button>
        ))}
      </div>
      <details>
        <summary>Review station details</summary>
        <dl className="db-details">
          <div>
            <dt>Charging location</dt>
            <dd>{station.address}</dd>
          </div>
          <div>
            <dt>Charger</dt>
            <dd>
              {station.chargerType} · {station.connector} · {station.powerKw} kW
            </dd>
          </div>
          <div>
            <dt>Price per kWh</dt>
            <dd>{money(station.pricePaise)}</dd>
          </div>
          <div>
            <dt>Convenience fee</dt>
            <dd>{money(station.feePaise)}</dd>
          </div>
          <div>
            <dt>Identity check</dt>
            <dd>
              {verified?.identityMode === "DEMO"
                ? "Simulated identity check"
                : "External identity verification pending"}
            </dd>
          </div>
          <div>
            <dt>CCTV</dt>
            <dd>
              {verified?.cctvDeclared
                ? "Declared by host"
                : "Declaration missing"}
            </dd>
          </div>
          <div>
            <dt>Electrical safety</dt>
            <dd>
              {verified?.electricalDeclared
                ? "Declared by host"
                : "Declaration missing"}
            </dd>
          </div>
          <div>
            <dt>Host terms</dt>
            <dd>
              {verified?.termsAccepted ? "Accepted" : "Acceptance missing"}
            </dd>
          </div>
        </dl>
        <p className="db-review-note">{station.description}</p>
        {verified?.evidenceNote && (
          <p className="db-review-note">
            <strong>Safety evidence note</strong> {verified.evidenceNote}
          </p>
        )}
        {verified?.rejectionReason && (
          <p className="db-review-note">
            <strong>Previous decision</strong> {verified.rejectionReason}
          </p>
        )}
        {station.imageUrls.length > 0 && (
          <div className="db-image-list db-space-top">
            {station.imageUrls.map((url, index) => (
              <a href={url} target="_blank" rel="noreferrer" key={url}>
                <img
                  alt={`Charger photo ${index + 1}`}
                  src={url}
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )}
      </details>
      {decision && (
        <form
          className="db-form db-inline-form db-full-width"
          onSubmit={(event) => {
            event.preventDefault();
            const reason = String(
              new FormData(event.currentTarget).get("reason") ?? "",
            ).trim();
            update.mutate({ status: decision, reason: reason || undefined });
          }}
        >
          {decision === "APPROVED" ? (
            <p className="db-help">
              Approval makes this listing available to drivers. Identity status
              is recorded separately.
            </p>
          ) : (
            <label className="db-field">
              Decision reason
              <textarea name="reason" required maxLength={500} />
            </label>
          )}
          <div className="db-actions">
            <button
              className={`db-button${decision === "APPROVED" ? "" : " db-button-danger"}`}
              disabled={update.isPending}
            >
              {decision === "APPROVED"
                ? "Confirm approval"
                : decision === "REJECTED"
                  ? "Confirm rejection"
                  : "Confirm suspension"}
            </button>
            <button
              className="db-button db-button-secondary"
              type="button"
              onClick={() => setDecision(null)}
            >
              Close decision
            </button>
          </div>
        </form>
      )}
      {notice && (
        <div className="db-full-width">
          <Notice success>{notice}</Notice>
        </div>
      )}
      {update.error && (
        <div className="db-full-width">
          <Notice>{dashboardError(update.error)}</Notice>
        </div>
      )}
    </article>
  );
}

function AdminUsers() {
  const filter = useSearchFilter();
  const query = useQuery({
    queryKey: [...usersKey, filter.query, filter.status, filter.page],
    queryFn: ({ signal }) =>
      api<{ users: AdminUser[]; total: number }>(
        resultPath(
          "/admin/users",
          filter.query,
          filter.page,
          "role",
          filter.status,
        ),
        { signal },
      ),
  });
  return (
    <Section
      title="User management"
      text="Review roles and account status. Suspension ends any active sessions for the account."
    >
      <SearchControls
        state={filter}
        group="user"
        textLabel="Search by name or email"
        statusLabel="Account role"
      />
      {query.isPending && <Loading />}
      {query.isError && <Notice>{dashboardError(query.error)}</Notice>}
      {query.data && (
        <>
          {query.data.users.length ? (
            <div className="db-admin-list">
              {query.data.users.map((user) => (
                <AdminUserRow key={user.id} user={user} />
              ))}
            </div>
          ) : (
            <Empty
              title="No matching accounts"
              text="Try another name, email, or role."
            />
          )}
          <Pagination
            page={filter.page}
            total={query.data.total}
            limit={pageSize}
            onPage={filter.setPage}
          />
        </>
      )}
    </Section>
  );
}

function AdminUserRow({ user }: { user: AdminUser }) {
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  const action = user.status === "ACTIVE" ? "Suspend" : "Reactivate";
  const update = useMutation({
    mutationFn: () =>
      send(`/admin/users/${user.id}`, "PATCH", {
        status: user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
      }),
    onSuccess: () => {
      setConfirm(false);
      setNotice(
        user.status === "ACTIVE"
          ? "Account suspended."
          : "Account reactivated.",
      );
      void client.invalidateQueries({ queryKey: usersKey });
      void client.invalidateQueries({ queryKey: countKey });
      void client.invalidateQueries({ queryKey: ["stations"] });
    },
  });
  return (
    <article className="db-admin-row">
      <div>
        <h3>{user.name}</h3>
        <p>
          {user.email} · {roleLabel(user.role)}
        </p>
        <p>Joined {dateTime(user.createdAt)}</p>
      </div>
      <div className="db-actions">
        <Badge value={user.status} />
        {user.role !== "ADMIN" && (
          <button
            className="db-button db-button-secondary"
            onClick={() => {
              setConfirm(true);
              setNotice("");
              update.reset();
            }}
          >
            {action} account
          </button>
        )}
      </div>
      {confirm && (
        <div className="db-full-width db-inline-form">
          <p>
            {action} access for {user.name}?
          </p>
          <div className="db-actions db-space-top">
            <button
              className={`db-button${action === "Suspend" ? " db-button-danger" : ""}`}
              disabled={update.isPending}
              onClick={() => update.mutate()}
            >
              Confirm {action === "Suspend" ? "suspension" : "reactivation"}
            </button>
            <button
              className="db-button db-button-secondary"
              onClick={() => setConfirm(false)}
            >
              Close decision
            </button>
          </div>
        </div>
      )}
      {notice && (
        <div className="db-full-width">
          <Notice success>{notice}</Notice>
        </div>
      )}
      {update.error && (
        <div className="db-full-width">
          <Notice>{dashboardError(update.error)}</Notice>
        </div>
      )}
    </article>
  );
}

function AdminBookings() {
  const filter = useSearchFilter();
  const query = useQuery({
    queryKey: [
      "dashboard",
      "admin",
      "bookings",
      filter.query,
      filter.status,
      filter.page,
    ],
    queryFn: ({ signal }) =>
      api<{ bookings: Booking[]; total: number }>(
        resultPath(
          "/admin/bookings",
          filter.query,
          filter.page,
          "status",
          filter.status,
        ),
        { signal },
      ),
  });
  return (
    <Section
      title="Bookings and payments"
      text="Inspect reservations, payment status, and cancellation records."
    >
      <SearchControls
        state={filter}
        group="booking"
        textLabel="Search by booking ID"
        statusLabel="Booking status"
      />
      {query.isPending && <Loading />}
      {query.isError && <Notice>{dashboardError(query.error)}</Notice>}
      {query.data && (
        <>
          {query.data.bookings.length ? (
            <div className="db-admin-list">
              {query.data.bookings.map((booking) => (
                <article className="db-admin-row" key={booking.id}>
                  <div>
                    <h3>{booking.stationName}</h3>
                    <p>
                      {booking.id} · {booking.ownerName ?? "EV owner"}
                      {booking.sample ? " · Sample" : ""}
                    </p>
                  </div>
                  <div className="db-actions">
                    <Badge value={booking.status} />
                    <Badge value={booking.paymentStatus} />
                  </div>
                  <details>
                    <summary>Inspect booking</summary>
                    <dl className="db-details">
                      <div>
                        <dt>Starts</dt>
                        <dd>{dateTime(booking.start)}</dd>
                      </div>
                      <div>
                        <dt>Ends</dt>
                        <dd>{dateTime(booking.end)}</dd>
                      </div>
                      <div>
                        <dt>Host</dt>
                        <dd>{booking.hostName}</dd>
                      </div>
                      <div>
                        <dt>Estimated charge</dt>
                        <dd>{money(booking.totalPaise)}</dd>
                      </div>
                      <div>
                        <dt>Final charge</dt>
                        <dd>
                          {booking.finalPaise == null
                            ? "Awaiting measurement"
                            : money(booking.finalPaise)}
                        </dd>
                      </div>
                      <div>
                        <dt>Payment recorded</dt>
                        <dd>
                          {booking.paidPaise == null
                            ? "Awaiting payment"
                            : money(booking.paidPaise)}
                        </dd>
                      </div>
                      <div>
                        <dt>Payment provider</dt>
                        <dd>
                          {booking.paymentProvider === "RAZORPAY_TEST"
                            ? "Razorpay test mode"
                            : booking.paymentProvider === "DEMO"
                              ? "Demo simulator"
                              : booking.paymentProvider
                                ? titleCase(booking.paymentProvider)
                                : "None"}
                        </dd>
                      </div>
                    </dl>
                    {booking.cancelledAt && (
                      <p className="db-review-note">
                        Cancelled {dateTime(booking.cancelledAt)}
                        {booking.cancellationReason
                          ? ` · ${booking.cancellationReason}`
                          : ""}
                      </p>
                    )}
                  </details>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="No matching bookings"
              text="Try another booking ID or status."
            />
          )}
          <Pagination
            page={filter.page}
            total={query.data.total}
            limit={pageSize}
            onPage={filter.setPage}
          />
        </>
      )}
    </Section>
  );
}

function AdminIssues() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("OPEN");
  const reviews = useQuery({
    queryKey: issuesKey,
    queryFn: () => api<{ reviews: DashboardReview[] }>("/admin/issues"),
  });
  const support = useQuery({
    queryKey: [...supportKey, status, page],
    queryFn: () =>
      api<{ requests: SupportRequest[]; total: number; pageSize: number }>(
        `/admin/support?page=${page}${status ? `&status=${status}` : ""}`,
      ),
  });
  return (
    <>
      <Section
        title="Support requests"
        text="Read driver and host requests and update their resolution status."
      >
        <div className="db-search-tools">
          <label className="db-field">
            Request status
            <select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
            >
              <option value="">All requests</option>
              <option value="OPEN">Open</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </label>
        </div>
        {support.isPending && <Loading />}
        {support.isError && <Notice>{dashboardError(support.error)}</Notice>}
        {support.data && (
          <>
            {support.data.requests.length ? (
              <div className="db-admin-list">
                {support.data.requests.map((request) => (
                  <SupportRow key={request.id} request={request} />
                ))}
              </div>
            ) : (
              <Empty title="No matching support requests" />
            )}
            <Pagination
              page={page}
              total={support.data.total}
              limit={support.data.pageSize}
              onPage={setPage}
            />
          </>
        )}
      </Section>
      <Section
        title="Reported reviews"
        text="Inspect flagged reviews and control their visibility."
      >
        {reviews.isPending && <Loading />}
        {reviews.isError && <Notice>{dashboardError(reviews.error)}</Notice>}
        {reviews.data &&
          (reviews.data.reviews.length ? (
            <div className="db-admin-list">
              {reviews.data.reviews.map((review) => (
                <ReviewRow key={review.id} review={review} />
              ))}
            </div>
          ) : (
            <Empty title="No reported reviews" />
          ))}
      </Section>
    </>
  );
}

function SupportRow({ request }: { request: SupportRequest }) {
  const client = useQueryClient();
  const update = useMutation({
    mutationFn: () =>
      send(`/admin/support/${request.id}`, "PATCH", {
        status: request.status === "OPEN" ? "RESOLVED" : "OPEN",
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: supportKey });
      void client.invalidateQueries({ queryKey: countKey });
    },
  });
  return (
    <article className="db-admin-row">
      <div>
        <h3>{request.subject}</h3>
        <p>
          {request.name} · {request.email} · {dateTime(request.createdAt)}
        </p>
      </div>
      <div className="db-actions">
        <Badge value={request.status} />
        <button
          className="db-button db-button-secondary"
          disabled={update.isPending}
          onClick={() => update.mutate()}
        >
          {request.status === "OPEN" ? "Mark resolved" : "Reopen request"}
        </button>
      </div>
      <details>
        <summary>Read request</summary>
        <p className="db-review-note">{request.message}</p>
      </details>
      {update.error && (
        <div className="db-full-width">
          <Notice>{dashboardError(update.error)}</Notice>
        </div>
      )}
      {update.isSuccess && (
        <div className="db-full-width">
          <Notice success>Support request updated.</Notice>
        </div>
      )}
    </article>
  );
}

function ReviewRow({ review }: { review: DashboardReview }) {
  const client = useQueryClient();
  const update = useMutation({
    mutationFn: () =>
      send(`/admin/reviews/${review.id}`, "PATCH", { hidden: !review.hidden }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: issuesKey });
      void client.invalidateQueries({ queryKey: countKey });
      void client.invalidateQueries({ queryKey: ["station"] });
      void client.invalidateQueries({ queryKey: ["stations"] });
    },
  });
  return (
    <article className="db-admin-row">
      <div>
        <h3>{review.stationName}</h3>
        <p>
          {review.authorName} · {review.rating}/5
          {review.sample ? " · Sample review" : ""} ·{" "}
          {review.hidden ? "Hidden" : "Visible"}
        </p>
      </div>
      <button
        className="db-button db-button-secondary"
        disabled={update.isPending}
        onClick={() => update.mutate()}
      >
        {review.hidden ? "Restore review" : "Hide review"}
      </button>
      <details>
        <summary>Inspect report</summary>
        <p className="db-review-note">
          <strong>Review</strong> {review.comment}
        </p>
        <p className="db-review-note">
          <strong>Reported reason</strong> {review.reportReason}
        </p>
      </details>
      {update.error && (
        <div className="db-full-width">
          <Notice>{dashboardError(update.error)}</Notice>
        </div>
      )}
      {update.isSuccess && (
        <div className="db-full-width">
          <Notice success>Review visibility updated.</Notice>
        </div>
      )}
    </article>
  );
}
