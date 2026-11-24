import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  Heart,
  IndianRupee,
  MapPin,
  Search,
  UserRound,
  XCircle,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api, dateTime, money, useAuth } from "../lib";
import {
  ActionLink,
  Badge,
  DashboardNav,
  Empty,
  Header,
  Loading,
  Notice,
  Section,
  Stat,
  dashboardError,
  send,
  useDashboardTab,
  type Booking,
  type Station,
} from "./shared";

const bookingKey = ["dashboard", "owner", "bookings"];
const activeStatuses = ["PENDING", "CONFIRMED", "IN_PROGRESS"];

function useBookings() {
  return useQuery({
    queryKey: bookingKey,
    queryFn: () => api<{ bookings: Booking[] }>("/bookings"),
  });
}

export function Owner() {
  const { user } = useAuth();
  const bookings = useBookings();
  const favorites = useQuery({
    queryKey: ["users", "favorites"],
    queryFn: () => api<{ stationIds: string[] }>("/users/favorites"),
  });
  const stations = useQuery({
    queryKey: ["dashboard", "favorites", favorites.data?.stationIds],
    enabled: Boolean(favorites.data?.stationIds.length),
    queryFn: async () => {
      const records = await Promise.allSettled(
        (favorites.data?.stationIds ?? []).map((id) =>
          api<{ station: Station }>(`/stations/${id}`),
        ),
      );
      return records.flatMap((result) =>
        result.status === "fulfilled" ? [result.value.station] : [],
      );
    },
  });
  const all = bookings.data?.bookings ?? [];
  const upcoming = all
    .filter((booking) => activeStatuses.includes(booking.status))
    .sort((a, b) => a.start.localeCompare(b.start));
  const completed = all.filter((booking) => booking.status === "COMPLETED");
  const cancelled = all.filter((booking) => booking.status === "CANCELLED");
  const estimate = upcoming.reduce(
    (total, booking) => total + booking.totalPaise,
    0,
  );
  const recent = [...all]
    .sort((a, b) =>
      (b.cancelledAt ?? b.createdAt).localeCompare(
        a.cancelledAt ?? a.createdAt,
      ),
    )
    .slice(0, 4);

  return (
    <div className="db-page">
      <div className="db-wrap">
        <Header
          title={`Welcome${user?.name ? `, ${user.name.split(" ")[0]}` : ""}`}
          text="Manage reservations and plan your next charge."
          action={
            <ActionLink to="/chargers">
              <Search size={17} /> Find Chargers
            </ActionLink>
          }
        />
        {bookings.isPending && <Loading />}
        {bookings.isError && <Notice>{dashboardError(bookings.error)}</Notice>}
        {bookings.isSuccess && (
          <div className="db-stats">
            <Stat
              label="Upcoming bookings"
              value={upcoming.length}
              icon={CalendarDays}
            />
            <Stat
              label="Completed sessions"
              value={completed.length}
              icon={CheckCircle2}
            />
            <Stat
              label="Cancelled bookings"
              value={cancelled.length}
              icon={XCircle}
            />
            <Stat
              label="Estimated upcoming cost"
              value={money(estimate)}
              icon={IndianRupee}
            />
          </div>
        )}
        <div className="db-hero-row">
          <div>
            <Section
              title="Upcoming bookings"
              action={
                <Link className="db-text-link" to="/owner/bookings">
                  My bookings
                </Link>
              }
            >
              {bookings.isSuccess &&
                (upcoming.length ? (
                  <ul className="db-row-list">
                    {upcoming.slice(0, 4).map((booking) => (
                      <li className="db-row" key={booking.id}>
                        <div>
                          <Link to={`/owner/bookings?booking=${booking.id}`}>
                            {booking.stationName}
                          </Link>
                          <small>{dateTime(booking.start)}</small>
                        </div>
                        <Badge value={booking.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty
                    title="No upcoming bookings"
                    text="Choose a charger and reserve a time that works for you."
                  />
                ))}
            </Section>
            <Section title="Recent activity">
              {bookings.isSuccess &&
                (recent.length ? (
                  <ul className="db-row-list">
                    {recent.map((booking) => (
                      <li className="db-row" key={booking.id}>
                        <div>
                          <Link to={`/owner/bookings?booking=${booking.id}`}>
                            {booking.stationName}
                          </Link>
                          <small>
                            {dateTime(booking.cancelledAt ?? booking.createdAt)}
                            {booking.sample ? " · Sample booking" : ""}
                          </small>
                        </div>
                        <Badge value={booking.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty
                    title="No activity yet"
                    text="Your reservations and cancellations will appear here."
                  />
                ))}
            </Section>
          </div>
          <div>
            <Section title="Quick actions">
              <div className="db-quick-actions">
                <ActionLink to="/chargers" secondary>
                  <Search size={16} /> Find Chargers
                </ActionLink>
                <ActionLink to="/owner/bookings" secondary>
                  <CalendarDays size={16} /> My bookings
                </ActionLink>
                <ActionLink to="/profile" secondary>
                  <UserRound size={16} /> Manage profile
                </ActionLink>
                <ActionLink to="/chargers?nearby=1" secondary>
                  <MapPin size={16} /> Nearby stations
                </ActionLink>
              </div>
            </Section>
            <Section title="Favorite stations">
              {(favorites.isPending ||
                (stations.fetchStatus === "fetching" &&
                  stations.isPending)) && <Loading />}
              {favorites.isError && (
                <Notice>{dashboardError(favorites.error)}</Notice>
              )}
              {favorites.isSuccess && !favorites.data.stationIds.length && (
                <Empty
                  title="No favorite stations"
                  text="Save chargers you want to revisit while browsing."
                />
              )}
              {stations.isSuccess &&
                (stations.data.length ? (
                  <ul className="db-row-list">
                    {stations.data.map((station) => (
                      <li className="db-row" key={station.id}>
                        <div>
                          <Link to={`/chargers/${station.id}`}>
                            {station.name}
                          </Link>
                          <small>
                            {station.locality}, {station.city}
                          </small>
                        </div>
                        <Heart size={17} aria-hidden="true" />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty
                    title="Your saved stations are unavailable"
                    text="Check back when a listing is active again."
                  />
                ))}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

const bookingTabs = [
  { id: "all", label: "All bookings" },
  { id: "upcoming", label: "Upcoming" },
  { id: "history", label: "History" },
];

export function Bookings() {
  const bookings = useBookings();
  const [searchParams] = useSearchParams();
  const [tab, select] = useDashboardTab(
    "all",
    bookingTabs.map((item) => item.id),
  );
  const highlightedId = searchParams.get("booking");
  const list = [...(bookings.data?.bookings ?? [])].filter(
    (booking) =>
      tab === "all" ||
      (tab === "upcoming"
        ? activeStatuses.includes(booking.status)
        : !activeStatuses.includes(booking.status)),
  );
  list.sort(
    (a, b) =>
      Number(b.id === highlightedId) - Number(a.id === highlightedId) ||
      b.start.localeCompare(a.start),
  );
  return (
    <div className="db-page">
      <div className="db-wrap">
        <Header
          title="My bookings"
          text="Review reservations, charging costs, and past sessions."
          action={<ActionLink to="/chargers">Find Chargers</ActionLink>}
        />
        <DashboardNav items={bookingTabs} selected={tab} onSelect={select} />
        {bookings.isPending && <Loading />}
        {bookings.isError && <Notice>{dashboardError(bookings.error)}</Notice>}
        {bookings.isSuccess &&
          (list.length ? (
            <div className="db-bookings">
              {list.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  highlighted={booking.id === highlightedId}
                />
              ))}
            </div>
          ) : (
            <Empty
              title="No bookings in this view"
              text="Browse chargers to find your next charging slot."
              action={
                <ActionLink to="/chargers" secondary>
                  Browse chargers
                </ActionLink>
              }
            />
          ))}
      </div>
    </div>
  );
}

type PaymentOrder = {
  mode: "demo" | "razorpay_test";
  amountPaise: number;
  currency: "INR";
  orderId?: string;
  keyId?: string;
};
type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (result: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
};
type RazorpayClient = {
  open(): void;
  on(event: string, handler: () => void): void;
};
type RazorpayWindow = Window & {
  Razorpay?: new (options: RazorpayOptions) => RazorpayClient;
};
let razorpayLoading: Promise<void> | undefined;

async function loadCheckout() {
  const checkoutWindow = window as RazorpayWindow;
  if (checkoutWindow.Razorpay) return checkoutWindow.Razorpay;
  razorpayLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      razorpayLoading = undefined;
      script.remove();
      reject(new Error("Razorpay could not load. Try again."));
    };
    document.head.append(script);
  });
  await razorpayLoading;
  if (!checkoutWindow.Razorpay)
    throw new Error("Razorpay checkout could not start.");
  return checkoutWindow.Razorpay;
}

function BookingCard({
  booking,
  highlighted,
}: {
  booking: Booking;
  highlighted: boolean;
}) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<"payment" | "cancel" | "review" | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const closeAction = () => {
    setAction(null);
    setCheckoutError("");
  };
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: bookingKey });
  const success = (text: string) => {
    closeAction();
    setNotice(text);
    void invalidate();
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const order = useMutation({
    mutationFn: () =>
      send<PaymentOrder>(`/payments/${booking.id}/order`, "POST", {}),
  });
  const payDemo = useMutation({
    mutationFn: () => send(`/payments/${booking.id}/demo`, "POST", {}),
    onSuccess: () => success("Demo payment recorded."),
  });
  const verify = useMutation({
    mutationFn: (result: RazorpayResponse) =>
      send(`/payments/${booking.id}/verify`, "POST", {
        orderId: result.razorpay_order_id,
        paymentId: result.razorpay_payment_id,
        signature: result.razorpay_signature,
      }),
    onSuccess: () => success("Razorpay test payment verified."),
  });
  const cancel = useMutation({
    mutationFn: () =>
      send(`/bookings/${booking.id}/cancel`, "POST", {
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["station-slots", booking.stationId],
      });
      void queryClient.invalidateQueries({ queryKey: ["stations"] });
      success("Booking cancelled.");
    },
  });
  const review = useMutation({
    mutationFn: () =>
      send("/reviews", "POST", {
        bookingId: booking.id,
        rating,
        comment: comment.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["station", booking.stationId],
      });
      success("Your review was published.");
    },
  });

  const startRazorpay = async () => {
    const data = order.data;
    if (!data?.keyId || !data.orderId) return;
    setCheckoutError("");
    setCheckoutOpen(true);
    try {
      const Razorpay = await loadCheckout();
      const client = new Razorpay({
        key: data.keyId,
        amount: data.amountPaise,
        currency: data.currency,
        name: "PlugLink",
        description: "Test payment for EV charging",
        order_id: data.orderId,
        handler: (result) => {
          setCheckoutOpen(false);
          verify.mutate(result);
        },
        modal: { ondismiss: () => setCheckoutOpen(false) },
      });
      client.on("payment.failed", () => {
        setCheckoutOpen(false);
        setCheckoutError(
          "The test payment failed. You can retry from this reservation.",
        );
      });
      client.open();
    } catch (error) {
      setCheckoutOpen(false);
      setCheckoutError(dashboardError(error));
    }
  };
  const showAction = (next: typeof action) => {
    setNotice("");
    setCheckoutError("");
    setAction(next);
  };
  const due = booking.finalPaise ?? booking.totalPaise;
  const canCancel =
    ["PENDING", "CONFIRMED"].includes(booking.status) &&
    Date.parse(booking.start) > Date.now();
  const canPay =
    ["PENDING", "CONFIRMED", "COMPLETED"].includes(booking.status) &&
    booking.paymentStatus !== "PAID";
  const paymentError = order.error ?? payDemo.error ?? verify.error;
  const facilityCoordinates =
    booking.latitude == null || booking.longitude == null
      ? null
      : `${booking.latitude},${booking.longitude}`;

  return (
    <article
      className={`db-booking${highlighted ? " db-booking-highlight" : ""}`}
    >
      <div className="db-booking-head">
        <div>
          <h2>{booking.stationName}</h2>
          <p>
            {booking.locality} · {booking.sample ? "Sample booking · " : ""}
            <Link
              className="db-text-link"
              to={`/chargers/${booking.stationId}`}
            >
              Station details
            </Link>
          </p>
        </div>
        <div>
          <Badge value={booking.status} />
          <Badge value={booking.paymentStatus} />
        </div>
      </div>
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
          <dt>
            {booking.actualEnergyWh == null
              ? "Requested energy"
              : "Recorded energy"}
          </dt>
          <dd>{(booking.actualEnergyWh ?? booking.energyWh) / 1000} kWh</dd>
        </div>
        <div>
          <dt>
            {booking.finalPaise == null ? "Estimated cost" : "Final cost"}
          </dt>
          <dd>{money(due)}</dd>
        </div>
      </dl>
      {booking.address && (
        <p className="db-help db-inline-form">
          <MapPin size={14} aria-hidden="true" /> {booking.address}
          {facilityCoordinates && (
            <>
              {" "}
              ·{" "}
              <a
                className="db-text-link"
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(facilityCoordinates)}`}
                target="_blank"
                rel="noreferrer"
              >
                Get directions
              </a>
            </>
          )}
        </p>
      )}
      {booking.status === "PENDING" && booking.expiresAt && (
        <p className="db-help db-inline-form">
          Reservation hold expires {dateTime(booking.expiresAt)}.
        </p>
      )}
      {booking.cancelledAt && (
        <p className="db-help db-inline-form">
          Cancelled {dateTime(booking.cancelledAt)}
          {booking.cancellationReason ? ` · ${booking.cancellationReason}` : ""}
        </p>
      )}
      {booking.paymentStatus === "PAID" && (
        <p className="db-help db-inline-form">
          {booking.paymentProvider === "DEMO"
            ? "Demo payment receipt"
            : booking.paymentProvider === "RAZORPAY_TEST"
              ? "Razorpay test payment receipt"
              : "Payment receipt"}{" "}
          · {money(booking.paidPaise ?? due)} · {booking.id}
        </p>
      )}
      {notice && <Notice success>{notice}</Notice>}
      <div className="db-booking-bottom">
        <p className="db-help">Booking {booking.id}</p>
        <div className="db-actions">
          {canPay && (
            <button
              className="db-button"
              onClick={() => {
                showAction("payment");
                order.reset();
                payDemo.reset();
                verify.reset();
                order.mutate();
              }}
            >
              Review payment
            </button>
          )}
          {canCancel && (
            <button
              className="db-button db-button-secondary"
              onClick={() => showAction("cancel")}
            >
              Cancel booking
            </button>
          )}
          {booking.status === "COMPLETED" && !booking.reviewId && (
            <button className="db-button" onClick={() => showAction("review")}>
              Write a review
            </button>
          )}
          {booking.reviewId && (
            <span className="db-help">Review submitted</span>
          )}
        </div>
      </div>
      {action === "payment" && (
        <div className="db-form db-inline-form">
          <h3>Charging cost</h3>
          <ul className="db-price-breakdown">
            <li>
              <span>Electricity at {money(booking.pricePaise)} per kWh</span>
              <span>{money(due - booking.feePaise)}</span>
            </li>
            <li>
              <span>Convenience fee</span>
              <span>{money(booking.feePaise)}</span>
            </li>
            <li>
              <span>
                {booking.finalPaise == null ? "Estimated total" : "Final total"}
              </span>
              <span>{money(order.data?.amountPaise ?? due)}</span>
            </li>
          </ul>
          {order.isPending && <Loading />}
          {paymentError && <Notice>{dashboardError(paymentError)}</Notice>}
          {checkoutError && <Notice>{checkoutError}</Notice>}
          {order.data && (
            <p className="db-help">
              {order.data.mode === "demo"
                ? "Demo payment simulates checkout. No money is transferred."
                : "Razorpay test checkout uses test payment details. No money is transferred."}
            </p>
          )}
          <div className="db-actions">
            {order.data?.mode === "demo" && (
              <button
                className="db-button"
                disabled={payDemo.isPending}
                onClick={() => payDemo.mutate()}
              >
                {payDemo.isPending ? "Simulating…" : "Simulate payment"}
              </button>
            )}
            {order.data?.mode === "razorpay_test" && (
              <button
                className="db-button"
                disabled={checkoutOpen || verify.isPending}
                onClick={() => void startRazorpay()}
              >
                {verify.isPending
                  ? "Verifying…"
                  : "Open Razorpay test checkout"}
              </button>
            )}
            <button
              className="db-button db-button-secondary"
              onClick={closeAction}
            >
              Close payment
            </button>
          </div>
        </div>
      )}
      {action === "cancel" && (
        <form
          className="db-form db-inline-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            cancel.mutate();
          }}
        >
          <h3>Cancel this reservation?</h3>
          <p className="db-help">
            The station time will be released. Payment remains visible in your
            booking history.
          </p>
          <label className="db-field">
            Reason (optional)
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={300}
            />
          </label>
          {cancel.error && <Notice>{dashboardError(cancel.error)}</Notice>}
          <div className="db-actions">
            <button
              className="db-button db-button-danger"
              disabled={cancel.isPending}
            >
              {cancel.isPending ? "Cancelling…" : "Confirm cancellation"}
            </button>
            <button
              type="button"
              className="db-button db-button-secondary"
              onClick={closeAction}
            >
              Keep booking
            </button>
          </div>
        </form>
      )}
      {action === "review" && (
        <form
          className="db-form db-inline-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            review.mutate();
          }}
        >
          <h3>Review your charging experience</h3>
          <label className="db-field">
            Rating
            <select
              value={rating}
              onChange={(event) => setRating(Number(event.target.value))}
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value} {value === 1 ? "star" : "stars"}
                </option>
              ))}
            </select>
          </label>
          <label className="db-field">
            Review
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              required
              minLength={5}
              maxLength={1000}
            />
          </label>
          {review.error && <Notice>{dashboardError(review.error)}</Notice>}
          <div className="db-actions">
            <button className="db-button" disabled={review.isPending}>
              {review.isPending ? "Publishing…" : "Publish review"}
            </button>
            <button
              type="button"
              className="db-button db-button-secondary"
              onClick={closeAction}
            >
              Close review
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
