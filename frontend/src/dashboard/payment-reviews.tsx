import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, dateTime, money } from "../lib";
import {
  DashboardNav,
  Empty,
  Loading,
  Notice,
  Section,
  dashboardError,
  paymentVarianceLabel,
  send,
  type Booking,
} from "./shared";

const reviewKey = ["dashboard", "admin", "payment-reviews"];
const pageSize = 20;
const tabs = [
  { id: "OPEN", label: "Awaiting review" },
  { id: "REVIEWED", label: "Reviewed" },
];

export function PaymentReviews() {
  const [status, setStatus] = useState("OPEN");
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: [...reviewKey, status, page],
    queryFn: ({ signal }) =>
      api<{ bookings: Booking[]; total: number }>(
        `/admin/payment-reviews?status=${status}&limit=${pageSize}&offset=${page * pageSize}`,
        { signal },
      ),
  });
  const records = query.data?.bookings ?? [];
  const total = query.data?.total ?? 0;
  const changeStatus = (value: string) => {
    setStatus(value);
    setPage(0);
  };

  return (
    <Section
      title="Payment review"
      text="Compare recorded payments with final charges and review inactive reservations that received a payment."
    >
      <DashboardNav items={tabs} selected={status} onSelect={changeStatus} />
      {query.isPending && <Loading />}
      {query.isError && <Notice>{dashboardError(query.error)}</Notice>}
      {query.isSuccess && (
        <>
          {records.length ? (
            <div className="db-admin-list">
              {records.map((booking) => (
                <PaymentReviewRow key={booking.id} booking={booking} />
              ))}
            </div>
          ) : (
            <Empty
              title={
                status === "OPEN"
                  ? "No payments awaiting review"
                  : "No reviewed payments on this page"
              }
            />
          )}
          {(total > pageSize || page > 0) && (
            <div
              className="db-actions db-space-top"
              aria-label="Payment review pages"
            >
              <button
                type="button"
                className="db-button db-button-secondary"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="db-button db-button-secondary"
                disabled={(page + 1) * pageSize >= total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function PaymentReviewRow({ booking }: { booking: Booking }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const review = useMutation({
    mutationFn: (note: string) =>
      send(`/admin/payment-reviews/${booking.id}`, "PUT", { note }),
    onSuccess: () => {
      setEditing(false);
      return client.invalidateQueries({ queryKey: reviewKey });
    },
  });
  const variance = booking.paymentVariance;
  if (!variance) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    review.mutate(
      String(new FormData(event.currentTarget).get("note") ?? "").trim(),
    );
  }

  return (
    <article className="db-admin-row">
      <div>
        <h3>{booking.stationName}</h3>
        <p>
          {booking.id}
          {booking.sample ? " · Sample" : ""} · {dateTime(booking.start)}
        </p>
        <p>
          <strong>{paymentVarianceLabel(variance.kind)}</strong> ·{" "}
          {money(variance.amountPaise)}
        </p>
      </div>
      {!variance.reviewedAt && !editing && (
        <button
          className="db-button db-button-secondary"
          type="button"
          onClick={() => setEditing(true)}
        >
          Record review
        </button>
      )}
      <dl className="db-details db-full-width">
        <div>
          <dt>Payment recorded</dt>
          <dd>
            {booking.paidPaise == null
              ? "Unavailable"
              : money(booking.paidPaise)}
          </dd>
        </div>
        <div>
          <dt>Final charge</dt>
          <dd>
            {booking.finalPaise == null
              ? "No final charge"
              : money(booking.finalPaise)}
          </dd>
        </div>
      </dl>
      {variance.reviewedAt && (
        <p className="db-review-note db-full-width">
          <strong>Reviewed {dateTime(variance.reviewedAt)}</strong>
          {variance.note ? " · " + variance.note : ""}
        </p>
      )}
      {editing && (
        <form
          className="db-form db-inline-form db-full-width"
          onSubmit={submit}
        >
          <label className="db-field">
            Review outcome
            <textarea
              name="note"
              required
              minLength={8}
              maxLength={500}
              placeholder="Record the decision and any non-sensitive reference."
            />
          </label>
          <p className="db-help">
            This records your decision for the audit trail. Handle any charge or
            refund separately.
          </p>
          <div className="db-actions">
            <button
              type="submit"
              className="db-button"
              disabled={review.isPending}
            >
              Save review
            </button>
            <button
              type="button"
              className="db-button db-button-secondary"
              onClick={() => {
                setEditing(false);
                review.reset();
              }}
            >
              Close
            </button>
          </div>
          {review.isError && <Notice>{dashboardError(review.error)}</Notice>}
        </form>
      )}
    </article>
  );
}
