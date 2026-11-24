import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BatteryCharging,
  CalendarDays,
  Heart,
  MapPin,
  Navigation,
  ShieldCheck,
  Star,
  Zap,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, money, useAuth } from "../lib";
import {
  errorText,
  slotTime,
  stationDate,
  stationImage,
  type ChargingSlot,
  type ChargingStation,
  type StationReview,
} from "./catalog";

const StationMap = lazy(() => import("./StationMap"));

function PriceBreakdown({
  energyWh,
  pricePaise,
  feePaise,
}: {
  energyWh: number;
  pricePaise: number;
  feePaise: number;
}) {
  const electricity = Number(
    (BigInt(energyWh) * BigInt(pricePaise) + 500n) / 1_000n,
  );
  return (
    <dl className="pl-price-breakdown">
      <div>
        <dt>Electricity ({energyWh / 1000} kWh)</dt>
        <dd>{money(electricity)}</dd>
      </div>
      <div>
        <dt>Convenience fee</dt>
        <dd>{money(feePaise)}</dd>
      </div>
      <div>
        <dt>Estimated total</dt>
        <dd>{money(electricity + Number(feePaise))}</dd>
      </div>
    </dl>
  );
}

function BookingPanel({ station }: { station: ChargingStation }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = stationDate(new Date(), station.timezone);
  const lastDate = stationDate(
    new Date(Date.now() + 59 * 86_400_000),
    station.timezone,
  );
  const [date, setDate] = useState(today);
  const [selectedStart, setSelectedStart] = useState("");
  const [energy, setEnergy] = useState(
    String(Math.min(3, Number(station.powerKw))),
  );
  const [reviewing, setReviewing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  const availability = useQuery({
    queryKey: ["station-slots", station.id, date],
    queryFn: ({ signal }) =>
      api<{ slots: ChargingSlot[] }>(
        `/stations/${station.id}/slots?date=${encodeURIComponent(date)}`,
        { signal },
      ),
    enabled: Boolean(date),
  });
  const slot = availability.data?.slots.find(
    (candidate) => candidate.start === selectedStart,
  );
  const durationHours = slot
    ? (Date.parse(slot.end) - Date.parse(slot.start)) / 3600000
    : 1;
  const maxEnergy =
    Math.floor(Number(station.powerKw) * durationHours * 10) / 10;
  const energyWh = Math.round(Number(energy) * 1000);
  const formatSlot = (item: ChargingSlot) =>
    `${slotTime(item.start, station.timezone)} – ${slotTime(item.end, station.timezone)}`;

  const reserve = useMutation({
    mutationFn: (item: ChargingSlot) =>
      api<{ booking: { id: string } }>("/bookings", {
        method: "POST",
        body: JSON.stringify({
          stationId: station.id,
          start: item.start,
          end: item.end,
          energyWh,
        }),
      }),
    onSuccess: ({ booking }) => {
      void queryClient.invalidateQueries({
        queryKey: ["station-slots", station.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["stations"] });
      void queryClient.invalidateQueries({
        queryKey: ["dashboard", "owner", "bookings"],
      });
      navigate(`/owner/bookings?booking=${encodeURIComponent(booking.id)}`);
    },
  });

  useEffect(() => {
    const element = dialog.current;
    if (reviewing && element && !element.open) element.showModal();
    if (!reviewing && element?.open) element.close();
  }, [reviewing]);

  function openReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/chargers/${station.id}`)}`);
      return;
    }
    if (user.role === "OWNER" && slot) {
      reserve.reset();
      setReviewing(true);
    }
  }

  function closeReview() {
    setReviewing(false);
    if (reserve.isError) void availability.refetch();
  }

  return (
    <section className="pl-panel pl-booking" aria-labelledby="pl-booking-title">
      <div className="pl-booking-rate">
        <strong>{money(station.pricePaise)}</strong>
        <span> / kWh</span>
      </div>
      <p className="pl-muted">+ {money(station.feePaise)} convenience fee</p>
      <hr />
      <h2 id="pl-booking-title">
        <CalendarDays size={21} aria-hidden="true" /> Reserve a charging slot
      </h2>
      <form className="pl-booking-form" onSubmit={openReview}>
        <label>
          Charging date
          <input
            type="date"
            value={date}
            min={today}
            max={lastDate}
            onChange={(event) => {
              setDate(event.target.value);
              setSelectedStart("");
            }}
            required
          />
        </label>
        <fieldset className="pl-slots">
          <legend>Available time slots</legend>
          <p className="pl-subtle">
            {(station.timezone || "Asia/Kolkata").replaceAll("_", " ")} local
            time
          </p>
          {!date && <p>Choose a date to check scheduled slots.</p>}
          {availability.isFetching && (
            <p role="status">Checking scheduled slots…</p>
          )}
          {availability.isError && (
            <p role="alert">
              {errorText(availability.error, "Slots could not be loaded.")}{" "}
              <button
                type="button"
                className="pl-inline-button"
                onClick={() => void availability.refetch()}
              >
                Try again
              </button>
            </p>
          )}
          {availability.isSuccess &&
            (!availability.data.slots.length ? (
              <p>No slots are open on this date. Try another day.</p>
            ) : (
              <div className="pl-slot-grid">
                {availability.data.slots.map((item) => (
                  <label key={item.start} className="pl-slot">
                    <input
                      type="radio"
                      name="charging-slot"
                      value={item.start}
                      checked={selectedStart === item.start}
                      onChange={() => setSelectedStart(item.start)}
                      required
                    />
                    <span>{formatSlot(item)}</span>
                  </label>
                ))}
              </div>
            ))}
        </fieldset>
        <label>
          Estimated energy (kWh)
          <input
            type="number"
            min="0.1"
            max={maxEnergy}
            step="0.1"
            value={energy}
            onChange={(event) => setEnergy(event.target.value)}
            required
          />
        </label>
        <p className="pl-subtle">Up to {maxEnergy} kWh for this slot.</p>
        {Number.isSafeInteger(energyWh) &&
          energyWh > 0 &&
          energyWh <= maxEnergy * 1000 && (
            <PriceBreakdown
              energyWh={energyWh}
              pricePaise={station.pricePaise}
              feePaise={station.feePaise}
            />
          )}
        {!user ? (
          <Link
            to={`/login?next=${encodeURIComponent(`/chargers/${station.id}`)}`}
            className="pl-btn pl-btn-primary"
          >
            Log in to book
          </Link>
        ) : user.role === "OWNER" ? (
          <button
            type="submit"
            className="pl-btn pl-btn-primary"
            disabled={!slot}
          >
            Review booking
          </button>
        ) : (
          <p className="pl-state">
            An EV owner account is required to reserve a slot.
          </p>
        )}
      </form>
      <dialog
        ref={dialog}
        onClose={closeReview}
        className="pl-booking-dialog"
        aria-labelledby="pl-review-title"
      >
        <h2 id="pl-review-title">Review your booking</h2>
        <p>
          <strong>{station.name}</strong>
        </p>
        {slot && (
          <p>
            {date} · {formatSlot(slot)}
          </p>
        )}
        <PriceBreakdown
          energyWh={energyWh}
          pricePaise={station.pricePaise}
          feePaise={station.feePaise}
        />
        <p className="pl-muted">
          Your charging cost is an estimate. Review payment options after
          reserving the slot.
        </p>
        {reserve.isError && (
          <p className="pl-error" role="alert">
            {errorText(reserve.error, "We could not reserve the slot.")}
          </p>
        )}
        <div className="pl-dialog-actions">
          <button
            type="button"
            className="pl-btn pl-btn-outline"
            onClick={closeReview}
          >
            Back
          </button>
          <button
            type="button"
            className="pl-btn pl-btn-primary"
            onClick={() => {
              if (slot) reserve.mutate(slot);
            }}
            disabled={!slot || reserve.isPending}
          >
            {reserve.isPending ? "Reserving…" : "Confirm booking"}
          </button>
        </div>
      </dialog>
    </section>
  );
}

function FavoriteButton({ stationId }: { stationId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["users", "favorites"];
  const isOwner = user?.role === "OWNER";
  const favorites = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api<{ stationIds: string[] }>("/users/favorites", { signal }),
    enabled: isOwner,
  });
  const saved = favorites.data?.stationIds.includes(stationId) ?? false;
  const toggle = useMutation({
    mutationFn: () =>
      api<{ stationIds: string[] }>(`/users/favorites/${stationId}`, {
        method: saved ? "DELETE" : "POST",
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });
  if (!isOwner) return null;
  return (
    <div className="pl-favorite">
      <button
        type="button"
        className="pl-btn pl-btn-outline"
        onClick={() => toggle.mutate()}
        aria-pressed={saved}
        disabled={favorites.isPending || toggle.isPending}
      >
        <Heart
          size={17}
          fill={saved ? "currentColor" : "none"}
          aria-hidden="true"
        />{" "}
        {saved ? "Saved" : "Save station"}
      </button>
      {toggle.isError && (
        <span className="pl-error" role="alert">
          {errorText(toggle.error)}
        </span>
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: StationReview }) {
  const { user } = useAuth();
  const report = useMutation({
    mutationFn: (reason: string) =>
      api(`/reviews/${review.id}/report`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
  });

  function sendReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    report.mutate(
      String(new FormData(event.currentTarget).get("reason") ?? "").trim(),
    );
  }

  return (
    <article className="pl-review">
      <div>
        <strong>{review.authorName}</strong>
        {review.sample && (
          <span className="pl-station-badge">Sample review</span>
        )}
        <span className="pl-rating">
          <Star size={14} fill="currentColor" aria-hidden="true" />{" "}
          {review.rating}/5
        </span>
      </div>
      <p>{review.comment}</p>
      {user &&
        (report.isSuccess ? (
          <p className="pl-subtle" role="status">
            Review reported for moderation.
          </p>
        ) : (
          <details className="pl-review-report">
            <summary>Report review</summary>
            <form onSubmit={sendReport}>
              <label>
                Reason
                <textarea
                  name="reason"
                  rows={2}
                  minLength={3}
                  maxLength={300}
                  required
                />
              </label>
              <button
                className="pl-btn pl-btn-outline"
                type="submit"
                disabled={report.isPending}
              >
                Submit report
              </button>
              {report.isError && (
                <p className="pl-error" role="alert">
                  {errorText(report.error)}
                </p>
              )}
            </form>
          </details>
        ))}
    </article>
  );
}

export function Station() {
  const { id } = useParams();
  const [photoIndex, setPhotoIndex] = useState(0);
  const listing = useQuery({
    queryKey: ["station", id],
    queryFn: ({ signal }) =>
      api<{ station: ChargingStation & { reviews: StationReview[] } }>(
        `/stations/${encodeURIComponent(id ?? "")}`,
        { signal },
      ),
    enabled: Boolean(id),
  });
  if (listing.isPending)
    return (
      <div className="pl-shell pl-state" role="status">
        Loading charging station…
      </div>
    );
  if (listing.isError || !listing.data.station)
    return (
      <div className="pl-shell pl-state">
        <h1>Station unavailable</h1>
        <p>
          {errorText(
            listing.error,
            "This station is unavailable or has been removed.",
          )}
        </p>
        <Link className="pl-btn pl-btn-outline" to="/chargers">
          Browse chargers
        </Link>
      </div>
    );

  const { station } = listing.data;
  const images = station.imageUrls?.length
    ? station.imageUrls
    : [stationImage(station)].filter(Boolean);
  const displayImage = images[photoIndex] ?? images[0];
  const directions = `https://www.openstreetmap.org/?mlat=${Number(station.latitude)}&mlon=${Number(station.longitude)}#map=15/${Number(station.latitude)}/${Number(station.longitude)}`;

  return (
    <div className="pl-shell pl-station-page">
      <Link to="/chargers" className="pl-back">
        All chargers
      </Link>
      <header className="pl-station-page-heading">
        <div>
          {station.sample && (
            <span className="pl-station-badge">Demo listing</span>
          )}
          <h1>{station.name}</h1>
          <p>
            <MapPin size={18} aria-hidden="true" /> {station.locality},{" "}
            {station.city}
            {station.rating != null && Number(station.reviewCount) > 0 && (
              <span className="pl-rating">
                <Star size={16} fill="currentColor" aria-hidden="true" />{" "}
                {Number(station.rating).toFixed(1)} ({station.reviewCount})
              </span>
            )}
          </p>
        </div>
        {!station.catalogExample && <FavoriteButton stationId={station.id} />}
      </header>
      <div className="pl-station-detail-grid">
        <div className="pl-station-main">
          <div className="pl-detail-photo">
            {displayImage ? (
              <img
                src={displayImage}
                alt={
                  station.sample
                    ? "Illustrative residential EV charger"
                    : `${station.name} charging equipment`
                }
              />
            ) : (
              <BatteryCharging size={58} aria-hidden="true" />
            )}
          </div>
          {images.length > 1 && (
            <div className="pl-thumbnail-grid">
              {images.map((source, index) => (
                <button
                  type="button"
                  key={source}
                  onClick={() => setPhotoIndex(index)}
                  aria-pressed={source === displayImage}
                  aria-label={`Show station photo ${index + 1}`}
                >
                  <img src={source} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
          <section className="pl-panel">
            <h2>About this charger</h2>
            <p>{station.description}</p>
            <dl className="pl-spec-grid">
              <div>
                <dt>
                  <Zap size={17} aria-hidden="true" /> Power
                </dt>
                <dd>{station.powerKw} kW</dd>
              </div>
              <div>
                <dt>
                  <BatteryCharging size={17} aria-hidden="true" /> Connector
                </dt>
                <dd>{station.connector}</dd>
              </div>
              {station.chargerType && (
                <div>
                  <dt>Charger type</dt>
                  <dd>{station.chargerType}</dd>
                </div>
              )}
              <div>
                <dt>Hosted by</dt>
                <dd>{station.hostName}</dd>
              </div>
            </dl>
          </section>
          <section className="pl-panel">
            <h2>
              <MapPin size={20} aria-hidden="true" /> Location
            </h2>
            <p>{station.address || `${station.locality}, ${station.city}`}</p>
            <p className="pl-subtle">
              {station.sample
                ? "This fictional demo address and map pin are for illustration."
                : "The public map shows the general area. Check your confirmed booking for arrival details."}
            </p>
            <Suspense fallback={<p role="status">Loading the map…</p>}>
              <StationMap stations={[station]} />
            </Suspense>
            {!station.catalogExample && (
              <a
                className="pl-btn pl-btn-outline pl-directions"
                href={directions}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation size={16} aria-hidden="true" /> Open map location
              </a>
            )}
          </section>
          <section className="pl-panel">
            <h2>
              <ShieldCheck size={20} aria-hidden="true" /> Charging safely
            </h2>
            <p>
              Confirm connector compatibility, follow the host’s instructions
              and inspect the cable before plugging in. Contact support if
              something appears unsafe.
            </p>
            <Link className="pl-card-link" to="/legal/safety">
              Safety guidelines
            </Link>
          </section>
          <section className="pl-panel">
            <h2>Station reviews</h2>
            {!station.reviews?.length && (
              <p className="pl-muted">No reviews yet.</p>
            )}
            {station.reviews?.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </section>
        </div>
        <aside>
          {station.catalogExample ? (
            <section className="pl-panel">
              <h2>Demo station</h2>
              <p>This fictional listing shows how charger details appear.</p>
              <p>Example rate {money(station.pricePaise)} / kWh</p>
              <p>Bookings are unavailable for demo listings.</p>
            </section>
          ) : (
            <BookingPanel station={station} key={station.id} />
          )}
        </aside>
      </div>
    </div>
  );
}
