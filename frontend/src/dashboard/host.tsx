import { lazy, Suspense, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  PlugZap,
  Plus,
  Store,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, dateTime, money } from "../lib";
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
  titleCase,
  useDashboardTab,
  type Booking,
  type Station,
} from "./shared";

interface Availability {
  day: number;
  startMinute: number;
  endMinute: number;
}
interface Block {
  id: string;
  start: string;
  end: string;
  reason: string | null;
}
export interface HostStation extends Station {
  chargerType: string;
  availability: Availability[];
  blocks: Block[];
  verification?: {
    status: string;
    identityMode: "DEMO" | "PENDING_EXTERNAL";
    cctvDeclared: boolean;
    electricalDeclared: boolean;
    termsAccepted: boolean;
    evidenceNote: string | null;
    rejectionReason: string | null;
  } | null;
}
export interface DashboardReview {
  id: string;
  stationName: string;
  rating: number;
  comment: string;
  createdAt: string;
  sample: boolean;
  authorName: string;
  reportReason?: string | null;
  hidden?: boolean;
}
interface Earnings {
  estimatedPaise: number;
  completedPaise: number;
  platformFeesPaise: number;
  eligiblePaise: number;
  paidOutPaise: number;
  energyWh: number;
}
interface HostOverview {
  stations: HostStation[];
  bookings: Booking[];
  earnings: Earnings;
  reviews: DashboardReview[];
}
const hostKey = ["dashboard", "host", "overview"];
const hostTabs = [
  { id: "overview", label: "Overview" },
  { id: "stations", label: "Stations" },
  { id: "bookings", label: "Bookings" },
  { id: "earnings", label: "Earnings" },
];
const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const demoIdentity = import.meta.env.DEV;
const EnergyChart = lazy(() => import("./energy-chart"));

export function Host() {
  const overview = useQuery({
    queryKey: hostKey,
    queryFn: () => api<HostOverview>("/hosts/overview"),
  });
  const [tab, select] = useDashboardTab(
    "overview",
    hostTabs.map((item) => item.id),
  );
  const [editor, setEditor] = useState<HostStation | "new" | null>(null);
  const [notice, setNotice] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const data = overview.data;
  const openEditor = (station: HostStation | "new") => {
    setNotice("");
    select("stations");
    setEditor(station);
  };
  const upcoming = (data?.bookings ?? [])
    .filter(
      ({ status }) =>
        status === "CONFIRMED" ||
        status === "IN_PROGRESS" ||
        status === "PENDING",
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  const completed = (data?.bookings ?? []).filter(
    ({ status }) => status === "COMPLETED",
  );

  return (
    <div className="db-page">
      <div className="db-wrap">
        <Header
          title="Host dashboard"
          text="Manage your charging stations, availability, and reservations."
          action={
            <button className="db-button" onClick={() => openEditor("new")}>
              <Plus size={17} /> Register a station
            </button>
          }
        />
        <DashboardNav
          items={hostTabs}
          selected={tab}
          onSelect={(next) => {
            setEditor(null);
            select(next);
          }}
        />
        {notice && <Notice success>{notice}</Notice>}
        {overview.isPending && <Loading />}
        {overview.isError && <Notice>{dashboardError(overview.error)}</Notice>}
        {tab === "overview" && data && (
          <>
            <div className="db-stats">
              <Stat
                label="Registered stations"
                value={data.stations.length}
                icon={Store}
              />
              <Stat
                label="Active stations"
                value={
                  data.stations.filter(({ status }) => status === "APPROVED")
                    .length
                }
                icon={PlugZap}
              />
              <Stat
                label="Pending approvals"
                value={
                  data.stations.filter(({ status }) => status === "PENDING")
                    .length
                }
                icon={Clock3}
              />
              <Stat
                label="Upcoming reservations"
                value={upcoming.length}
                icon={CalendarDays}
              />
              <Stat
                label="Completed sessions"
                value={completed.length}
                icon={CheckCircle2}
              />
            </div>
            <div className="db-cols">
              <Section
                title="Upcoming reservations"
                action={
                  <button
                    className="db-button db-button-secondary"
                    onClick={() => select("bookings")}
                  >
                    Manage bookings
                  </button>
                }
              >
                {upcoming.length ? (
                  <ul className="db-row-list">
                    {upcoming.slice(0, 4).map((booking) => (
                      <li key={booking.id} className="db-row">
                        <div>
                          <strong>{booking.stationName}</strong>
                          <small>
                            {dateTime(booking.start)}
                            {booking.sample ? " · Sample booking" : ""}
                          </small>
                        </div>
                        <Badge value={booking.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty
                    title="No upcoming reservations"
                    text="Approved stations can receive bookings from EV owners."
                  />
                )}
              </Section>
              <Section
                title="Earnings at a glance"
                action={
                  <button
                    className="db-button db-button-secondary"
                    onClick={() => select("earnings")}
                  >
                    View earnings
                  </button>
                }
              >
                <dl className="db-details">
                  <div>
                    <dt>Estimated upcoming</dt>
                    <dd>{money(data.earnings.estimatedPaise)}</dd>
                  </div>
                  <div>
                    <dt>Completed session revenue</dt>
                    <dd>{money(data.earnings.completedPaise)}</dd>
                  </div>
                  <div>
                    <dt>Confirmed payouts</dt>
                    <dd>{money(data.earnings.paidOutPaise)}</dd>
                  </div>
                </dl>
              </Section>
            </div>
            <Section title="Recent reviews">
              {data.reviews.length ? (
                <ul className="db-review-list">
                  {data.reviews.slice(0, 5).map((review) => (
                    <li key={review.id}>
                      <strong>{review.authorName}</strong>{" "}
                      <span
                        className="db-review-stars"
                        aria-label={`${review.rating} out of 5 stars`}
                      >
                        {"★".repeat(review.rating)}
                      </span>
                      <p className="db-help">
                        {review.stationName} · {dateTime(review.createdAt)}
                        {review.sample ? " · Sample review" : ""}
                      </p>
                      <p>{review.comment}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty
                  title="No reviews yet"
                  text="Feedback from completed charging sessions will appear here."
                />
              )}
            </Section>
          </>
        )}
        {tab === "stations" && (
          <>
            {editor && (
              <StationEditor
                key={editor === "new" ? "new" : editor.id}
                station={editor === "new" ? undefined : editor}
                onClose={() => setEditor(null)}
                onSaved={(message) => {
                  setNotice(message);
                  setEditor(null);
                }}
              />
            )}
            {data && (
              <Section
                title="Your charging stations"
                text="See approval status and manage listing details and blocked times."
              >
                {data.stations.length ? (
                  <div className="db-admin-list">
                    {data.stations.map((station) => (
                      <HostStationRow
                        key={station.id}
                        station={station}
                        onEdit={() => openEditor(station)}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="No charging stations yet"
                    text="Register your first home charger and send it for verification."
                    action={
                      <button
                        className="db-button db-button-secondary"
                        onClick={() => openEditor("new")}
                      >
                        Register your first station
                      </button>
                    }
                  />
                )}
              </Section>
            )}
          </>
        )}
        {tab === "bookings" && data && (
          <Section
            title="Reservations"
            text="Start confirmed sessions and record energy after charging finishes."
          >
            <div className="db-search-tools">
              <label className="db-field">
                Status
                <select
                  value={sessionFilter}
                  onChange={(event) => setSessionFilter(event.target.value)}
                >
                  <option value="">All statuses</option>
                  {[
                    "PENDING",
                    "CONFIRMED",
                    "IN_PROGRESS",
                    "COMPLETED",
                    "CANCELLED",
                    "EXPIRED",
                  ].map((status) => (
                    <option key={status} value={status}>
                      {titleCase(status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {data.bookings.some(
              (booking) => !sessionFilter || booking.status === sessionFilter,
            ) ? (
              <div className="db-bookings">
                {data.bookings
                  .filter(
                    (booking) =>
                      !sessionFilter || booking.status === sessionFilter,
                  )
                  .map((booking) => (
                    <HostBooking
                      key={booking.id}
                      booking={booking}
                      powerKw={
                        data.stations.find(
                          (station) => station.id === booking.stationId,
                        )?.powerKw
                      }
                    />
                  ))}
              </div>
            ) : (
              <Empty
                title="No reservations in this view"
                text="New reservations appear here when an EV owner books an approved charger."
              />
            )}
          </Section>
        )}
        {tab === "earnings" && data && (
          <HostEarnings earnings={data.earnings} completed={completed} />
        )}
      </div>
    </div>
  );
}

function minuteToTime(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
function timeToMinute(time: FormDataEntryValue | null) {
  const raw = String(time ?? "");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(raw)) return Number.NaN;
  const [hour, minute] = raw.split(":").map(Number);
  return hour * 60 + minute;
}
function toMinorUnit(value: string, scale: number) {
  const [whole, fraction = ""] = value.split(".");
  return (
    Number(whole || "0") * 10 ** scale + Number(fraction.padEnd(scale, "0"))
  );
}

function StationEditor({
  station,
  onClose,
  onSaved,
}: {
  station?: HostStation;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [images, setImages] = useState(station?.imageUrls ?? []);
  const [enabledDays, setEnabledDays] = useState<number[]>(
    station
      ? [...new Set(station.availability.map(({ day }) => day))]
      : weekdays.map((_, day) => day),
  );
  const [windows, setWindows] = useState(() =>
    weekdays.map((_, day) => {
      const listed =
        station?.availability.filter((row) => row.day === day) ?? [];
      return (
        listed.length ? listed : [{ startMinute: 480, endMinute: 1200 }]
      ).map((window, index) => ({ ...window, id: day * 24 + index }));
    }),
  );
  const nextWindowId = useRef(200);
  const [coordinates, setCoordinates] = useState({
    latitude: String(station?.latitude ?? 26.9124),
    longitude: String(station?.longitude ?? 75.7873),
  });
  const [locationError, setLocationError] = useState("");
  const [formError, setFormError] = useState("");
  const [savedId, setSavedId] = useState(station?.id);
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const results = await Promise.allSettled(
        files.map((file) =>
          api<{ url: string }>("/uploads", {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          }),
        ),
      );
      const successful = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value.url] : [],
      );
      setImages((current) => [...current, ...successful]);
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    },
  });
  const save = useMutation({
    mutationFn: async ({
      form,
      submit,
    }: {
      form: FormData;
      submit: boolean;
    }) => {
      const availability = enabledDays.flatMap((day) =>
        windows[day].map(({ id }) => ({
          day,
          startMinute: timeToMinute(form.get(`start-${id}`)),
          endMinute: timeToMinute(form.get(`end-${id}`)),
        })),
      );
      if (availability.length > 21)
        throw new Error("Use up to 21 weekly availability windows.");
      if (
        availability.some(
          ({ startMinute, endMinute }) =>
            !Number.isFinite(startMinute) ||
            !Number.isFinite(endMinute) ||
            endMinute - startMinute < 60,
        )
      )
        throw new Error("Each availability window must be at least one hour.");
      if (submit && !availability.length)
        throw new Error("Select at least one day the charger is available.");
      if (
        submit &&
        !["cctvDeclared", "electricalDeclared", "termsAccepted"].every(
          (key) => form.get(key) === "on",
        )
      )
        throw new Error(
          "Complete the three safety and host declarations to submit the listing.",
        );
      const evidenceNote = String(form.get("evidenceNote")).trim();
      const fields = {
        name: String(form.get("name")).trim(),
        city: String(form.get("city")).trim(),
        locality: String(form.get("locality")).trim(),
        address: String(form.get("address")).trim(),
        description: String(form.get("description")).trim(),
        chargerType: String(form.get("chargerType")),
        connector: String(form.get("connector")),
        powerKw: Number(form.get("powerKw")),
        pricePaise: toMinorUnit(String(form.get("price")), 2),
        feePaise: toMinorUnit(String(form.get("fee")), 2),
        latitude: Number(coordinates.latitude),
        longitude: Number(coordinates.longitude),
        imageUrls: images,
        availability,
        cctvDeclared: form.get("cctvDeclared") === "on",
        electricalDeclared: form.get("electricalDeclared") === "on",
        termsAccepted: form.get("termsAccepted") === "on",
        identityMode: form.get("identityMode"),
        evidenceNote:
          evidenceNote ||
          (station?.verification?.evidenceNote ? "" : undefined),
      };
      const saved = await send<{ station: HostStation }>(
        savedId ? `/hosts/stations/${savedId}` : "/hosts/stations",
        savedId ? "PATCH" : "POST",
        fields,
      );
      setSavedId(saved.station.id);
      void queryClient.invalidateQueries({ queryKey: hostKey });
      if (submit)
        await send(`/hosts/stations/${saved.station.id}/submit`, "POST", {});
      return {
        submitted: submit,
        returnedToDraft:
          station?.status === "APPROVED" && saved.station.status === "DRAFT",
      };
    },
    onSuccess: ({ submitted, returnedToDraft }) => {
      void queryClient.invalidateQueries({ queryKey: hostKey });
      void queryClient.invalidateQueries({ queryKey: ["stations"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (station) {
        void queryClient.invalidateQueries({
          queryKey: ["station", station.id],
        });
        void queryClient.invalidateQueries({
          queryKey: ["station-slots", station.id],
        });
      }
      onSaved(
        submitted
          ? "Station submitted for verification."
          : returnedToDraft
            ? "Station changes saved. Submit the updated draft for verification."
            : "Station changes saved.",
      );
    },
  });
  const getPosition = () => {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError(
        "Location services are unavailable. Enter coordinates manually.",
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        setCoordinates({
          latitude: coords.latitude.toFixed(6),
          longitude: coords.longitude.toFixed(6),
        }),
      () =>
        setLocationError(
          "Unable to access your location. Enter coordinates manually.",
        ),
      { timeout: 7000 },
    );
  };
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    const eventSubmitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const submit = eventSubmitter?.value === "submit";
    save.mutate({ form: new FormData(event.currentTarget), submit });
  };
  const connectorChoices = [
    "Type 2",
    "Type 1",
    "CCS2",
    "CHAdeMO",
    "Bharat AC-001",
    "15 A socket",
  ];
  const chargerTypes = ["AC", "DC"];
  if (station?.connector && !connectorChoices.includes(station.connector))
    connectorChoices.push(station.connector);
  if (station?.chargerType && !chargerTypes.includes(station.chargerType))
    chargerTypes.push(station.chargerType);
  return (
    <Section
      title={
        station ? `Edit ${station.name}` : "Register your charging station"
      }
      text={
        station?.status === "APPROVED"
          ? "Changes to the charger, location, or declarations require a new review."
          : "Enter charger details and complete the safety declarations to submit your station for verification."
      }
      action={
        <button className="db-button db-button-secondary" onClick={onClose}>
          Close form
        </button>
      }
    >
      <form className="db-form" onSubmit={onSubmit}>
        <fieldset className="db-fieldset">
          <legend>Station and location</legend>
          <div className="db-fields">
            <label className="db-field db-full">
              Station name
              <input
                name="name"
                defaultValue={station?.name}
                required
                minLength={3}
                maxLength={100}
              />
            </label>
            <label className="db-field">
              City
              <input
                name="city"
                defaultValue={station?.city ?? "Jaipur"}
                required
                minLength={2}
                maxLength={80}
              />
            </label>
            <label className="db-field">
              Locality
              <input
                name="locality"
                defaultValue={station?.locality}
                required
                minLength={2}
                maxLength={100}
              />
            </label>
            <label className="db-field db-full">
              Charging location address
              <input
                name="address"
                defaultValue={station?.address}
                required
                minLength={4}
                maxLength={250}
              />
              <span className="db-help">
                The street address is shared with booked drivers after
                confirmation.
              </span>
            </label>
            <label className="db-field">
              Latitude
              <input
                name="latitude"
                type="number"
                min={-90}
                max={90}
                step="any"
                required
                value={coordinates.latitude}
                onChange={(event) =>
                  setCoordinates({
                    ...coordinates,
                    latitude: event.target.value,
                  })
                }
              />
            </label>
            <label className="db-field">
              Longitude
              <input
                name="longitude"
                type="number"
                min={-180}
                max={180}
                step="any"
                required
                value={coordinates.longitude}
                onChange={(event) =>
                  setCoordinates({
                    ...coordinates,
                    longitude: event.target.value,
                  })
                }
              />
            </label>
            <div className="db-full">
              <button
                type="button"
                className="db-button db-button-secondary"
                onClick={getPosition}
              >
                Use my location
              </button>
              {locationError && <Notice>{locationError}</Notice>}
            </div>
            <label className="db-field db-full">
              Facility description
              <textarea
                name="description"
                defaultValue={station?.description}
                required
                minLength={10}
                maxLength={1500}
              />
            </label>
          </div>
        </fieldset>
        <fieldset className="db-fieldset">
          <legend>Charger and pricing</legend>
          <div className="db-fields">
            <label className="db-field">
              Charger type
              <select
                name="chargerType"
                defaultValue={station?.chargerType ?? "AC"}
              >
                {chargerTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="db-field">
              Connector type
              <select
                name="connector"
                defaultValue={station?.connector ?? "Type 2"}
              >
                {connectorChoices.map((connector) => (
                  <option key={connector}>{connector}</option>
                ))}
              </select>
            </label>
            <label className="db-field">
              Power capacity (kW)
              <input
                name="powerKw"
                type="number"
                min="1"
                max="350"
                step="0.001"
                defaultValue={station?.powerKw ?? 7.4}
                required
              />
            </label>
            <label className="db-field">
              Price per kWh (₹)
              <input
                name="price"
                type="number"
                min="1"
                max="1000"
                step="0.01"
                defaultValue={(station?.pricePaise ?? 1200) / 100}
                required
              />
            </label>
            <label className="db-field">
              Convenience fee (₹)
              <input
                name="fee"
                type="number"
                min="0"
                max="1000"
                step="0.01"
                defaultValue={(station?.feePaise ?? 2000) / 100}
                required
              />
            </label>
            <label className="db-field db-full">
              Charger photographs
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={upload.isPending || images.length >= 8}
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])];
                  setFormError("");
                  event.target.value = "";
                  if (files.length + images.length > 8) {
                    setFormError("Choose up to eight charger photographs.");
                    return;
                  }
                  if (files.length) upload.mutate(files);
                }}
              />
              <span className="db-help">
                Upload up to eight JPEG, PNG, or WebP photographs.
              </span>
            </label>
            {upload.isPending && (
              <p className="db-help db-full" role="status">
                Uploading photographs…
              </p>
            )}
            {upload.error && (
              <div className="db-full">
                <Notice>{dashboardError(upload.error)}</Notice>
              </div>
            )}
            {images.length > 0 && (
              <div className="db-image-list db-full">
                {images.map((url, index) => (
                  <div className="db-image-preview" key={url}>
                    <img src={url} alt={`Charger photo ${index + 1}`} />
                    <button
                      type="button"
                      onClick={() =>
                        setImages((current) =>
                          current.filter((item) => item !== url),
                        )
                      }
                    >
                      Remove photo {index + 1}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </fieldset>
        <fieldset className="db-fieldset">
          <legend>Weekly availability</legend>
          <p className="db-help">
            Choose days and hours in Jaipur local time (IST). Enter closing
            times in 24-hour format. Use 24:00 for midnight.
          </p>
          <div className="db-weekdays">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => {
              const active = enabledDays.includes(day);
              return (
                <div className="db-weekday" key={day}>
                  <label className="db-check">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() =>
                        setEnabledDays((days) =>
                          active
                            ? days.filter((value) => value !== day)
                            : [...days, day],
                        )
                      }
                    />{" "}
                    {weekdays[day]}
                  </label>
                  <div className="db-weekday-windows">
                    {windows[day].map(
                      ({ id, startMinute, endMinute }, index) => (
                        <div className="db-weekday-window" key={id}>
                          <label className="db-field">
                            <span className="db-visually-hidden">
                              {weekdays[day]} opening time
                              {index ? ` ${index + 1}` : ""}
                            </span>
                            <input
                              name={`start-${id}`}
                              type="time"
                              disabled={!active}
                              required={active}
                              defaultValue={minuteToTime(startMinute)}
                            />
                          </label>
                          <label className="db-field">
                            <span className="db-visually-hidden">
                              {weekdays[day]} closing time
                              {index ? ` ${index + 1}` : ""}
                            </span>
                            <input
                              name={`end-${id}`}
                              type="text"
                              pattern="(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00)"
                              maxLength={5}
                              disabled={!active}
                              required={active}
                              defaultValue={minuteToTime(endMinute)}
                            />
                          </label>
                          {active && windows[day].length > 1 && (
                            <button
                              type="button"
                              className="db-schedule-action"
                              onClick={() =>
                                setWindows((current) =>
                                  current.map((rows, value) =>
                                    value === day
                                      ? rows.filter((row) => row.id !== id)
                                      : rows,
                                  ),
                                )
                              }
                            >
                              Remove
                              <span className="db-visually-hidden">
                                {" "}
                                {weekdays[day]} window {index + 1}
                              </span>
                            </button>
                          )}
                        </div>
                      ),
                    )}
                    {active && (
                      <button
                        type="button"
                        className="db-schedule-action"
                        onClick={() => {
                          if (windows.flat().length >= 21) {
                            setFormError(
                              "Use up to 21 weekly availability windows.",
                            );
                            return;
                          }
                          const id = nextWindowId.current++;
                          setWindows((current) =>
                            current.map((rows, value) =>
                              value === day
                                ? [
                                    ...rows,
                                    { id, startMinute: 1200, endMinute: 1320 },
                                  ]
                                : rows,
                            ),
                          );
                        }}
                      >
                        Add hours
                        <span className="db-visually-hidden">
                          {" "}
                          on {weekdays[day]}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="db-fieldset">
          <legend>Identity and safety</legend>
          <label className="db-field">
            Identity verification method
            <select
              name="identityMode"
              defaultValue={
                station?.verification?.identityMode ??
                (demoIdentity ? "DEMO" : "PENDING_EXTERNAL")
              }
            >
              <option value="PENDING_EXTERNAL">
                External verification pending
              </option>
              {(demoIdentity ||
                station?.verification?.identityMode === "DEMO") && (
                <option value="DEMO">
                  Simulated identity check (development demo)
                </option>
              )}
            </select>
          </label>
          <p className="db-help">
            Aadhaar verification requires consent and an authorized provider.
            The demo mode records a simulation. Keep Aadhaar numbers and
            documents out of this form.
          </p>
          <label className="db-check">
            <input
              name="cctvDeclared"
              type="checkbox"
              defaultChecked={station?.verification?.cctvDeclared}
            />{" "}
            I declare working CCTV is available
          </label>
          <label className="db-check">
            <input
              name="electricalDeclared"
              type="checkbox"
              defaultChecked={station?.verification?.electricalDeclared}
            />{" "}
            I declare the charger installation meets electrical safety
            requirements
          </label>
          <label className="db-check">
            <input
              name="termsAccepted"
              type="checkbox"
              defaultChecked={station?.verification?.termsAccepted}
            />{" "}
            I accept the host guidelines and terms
          </label>
          <p className="db-help">
            <Link className="db-text-link" to="/legal/host-guidelines">
              Read the host guidelines
            </Link>
          </p>
          <label className="db-field">
            Safety evidence note (optional)
            <textarea
              name="evidenceNote"
              defaultValue={station?.verification?.evidenceNote ?? ""}
              maxLength={500}
            />
            <span className="db-help">
              Admins reviewing your station can see this note. Describe your
              CCTV and electrical safety measures.
            </span>
          </label>
        </fieldset>
        {formError && <Notice>{formError}</Notice>}
        {save.error && <Notice>{dashboardError(save.error)}</Notice>}
        <div className="db-actions">
          <button
            className="db-button db-button-secondary"
            disabled={save.isPending || upload.isPending}
            value="draft"
          >
            {save.isPending
              ? "Saving…"
              : station
                ? "Save changes"
                : "Save draft"}
          </button>
          {(!station || ["DRAFT", "REJECTED"].includes(station.status)) && (
            <button
              className="db-button"
              disabled={save.isPending || upload.isPending}
              value="submit"
            >
              Save and submit for verification
            </button>
          )}
          <button
            type="button"
            className="db-button db-button-secondary"
            onClick={onClose}
          >
            Discard form
          </button>
        </div>
      </form>
    </Section>
  );
}

function HostStationRow({
  station,
  onEdit,
}: {
  station: HostStation;
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const [blockOpen, setBlockOpen] = useState(false);
  const [prepareSubmit, setPrepareSubmit] = useState(false);
  const [notice, setNotice] = useState("");
  const updated = (message: string) => {
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: hostKey });
    void queryClient.invalidateQueries({ queryKey: ["stations"] });
    void queryClient.invalidateQueries({
      queryKey: ["station-slots", station.id],
    });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
  const submit = useMutation({
    mutationFn: () => send(`/hosts/stations/${station.id}/submit`, "POST", {}),
    onSuccess: () => {
      setPrepareSubmit(false);
      updated("Station submitted for verification.");
    },
  });
  const block = useMutation({
    mutationFn: (form: FormData) =>
      send(`/hosts/stations/${station.id}/blocks`, "POST", {
        start: `${String(form.get("start"))}:00+05:30`,
        end: `${String(form.get("end"))}:00+05:30`,
        reason: String(form.get("reason") ?? "").trim() || undefined,
      }),
    onSuccess: () => {
      setBlockOpen(false);
      updated("Blocked time added.");
    },
  });
  const unblock = useMutation({
    mutationFn: (blockId: string) =>
      send(`/hosts/stations/${station.id}/blocks/${blockId}`, "DELETE"),
    onSuccess: () => updated("Blocked time removed."),
  });
  const error = submit.error ?? block.error ?? unblock.error;
  return (
    <article className="db-admin-row">
      <div>
        <h3>{station.name}</h3>
        <p>
          {station.locality}, {station.city} · {station.powerKw} kW ·{" "}
          {station.connector}
          {station.sample ? " · Sample station" : ""}
        </p>
        {station.verification?.rejectionReason && (
          <p>Reviewer note — {station.verification.rejectionReason}</p>
        )}
      </div>
      <div className="db-actions">
        <Badge
          value={
            station.status === "PENDING"
              ? "PENDING_VERIFICATION"
              : station.status
          }
        />
        {station.status === "APPROVED" && (
          <ActionLink to={`/chargers/${station.id}`} secondary>
            View listing
          </ActionLink>
        )}
        {!["PENDING", "SUSPENDED"].includes(station.status) && (
          <button className="db-button db-button-secondary" onClick={onEdit}>
            Edit station
          </button>
        )}
        {["DRAFT", "REJECTED"].includes(station.status) && (
          <button
            className="db-button db-button-secondary"
            onClick={() => setPrepareSubmit((current) => !current)}
          >
            Submit for verification
          </button>
        )}
      </div>
      {prepareSubmit && (
        <div className="db-form db-full-width">
          <p className="db-help">
            Submit this station and its saved safety declarations for
            administrator review.
          </p>
          <div className="db-actions">
            <button
              className="db-button"
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
            >
              Confirm submission
            </button>
            <button
              className="db-button db-button-secondary"
              onClick={() => setPrepareSubmit(false)}
            >
              Close submission
            </button>
          </div>
        </div>
      )}
      <details>
        <summary>Availability and blocked times</summary>
        {station.availability.length ? (
          <ul className="db-row-list">
            {station.availability.map((schedule) => (
              <li
                className="db-row"
                key={`${schedule.day}-${schedule.startMinute}`}
              >
                <span>{weekdays[schedule.day]}</span>
                <span>
                  {minuteToTime(schedule.startMinute)}–
                  {minuteToTime(schedule.endMinute)} IST
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No weekly operating hours saved.</p>
        )}
        {station.blocks.length > 0 && (
          <ul className="db-row-list">
            {station.blocks.map((item) => (
              <li className="db-row" key={item.id}>
                <div>
                  <strong>
                    {dateTime(item.start)} – {dateTime(item.end)}
                  </strong>
                  <small>{item.reason}</small>
                </div>
                <button
                  className="db-button db-button-secondary"
                  disabled={unblock.isPending}
                  onClick={() => unblock.mutate(item.id)}
                >
                  Remove block
                </button>
              </li>
            ))}
          </ul>
        )}
        {!blockOpen && station.status !== "SUSPENDED" && (
          <button
            className="db-button db-button-secondary db-space-top"
            onClick={() => setBlockOpen(true)}
          >
            Block a time
          </button>
        )}
        {blockOpen && (
          <form
            className="db-form db-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              setNotice("");
              block.mutate(new FormData(event.currentTarget));
            }}
          >
            <div className="db-fields">
              <label className="db-field">
                Start (IST)
                <input name="start" type="datetime-local" required />
              </label>
              <label className="db-field">
                End (IST)
                <input name="end" type="datetime-local" required />
              </label>
              <label className="db-field db-full">
                Reason (optional)
                <input name="reason" maxLength={200} />
              </label>
            </div>
            <div className="db-actions">
              <button className="db-button" disabled={block.isPending}>
                Save blocked time
              </button>
              <button
                type="button"
                className="db-button db-button-secondary"
                onClick={() => setBlockOpen(false)}
              >
                Close block form
              </button>
            </div>
          </form>
        )}
      </details>
      {notice && (
        <div className="db-full-width">
          <Notice success>{notice}</Notice>
        </div>
      )}
      {error && (
        <div className="db-full-width">
          <Notice>{dashboardError(error)}</Notice>
        </div>
      )}
    </article>
  );
}

function HostBooking({
  booking,
  powerKw,
}: {
  booking: Booking;
  powerKw?: number;
}) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<"complete" | "cancel" | null>(null);
  const [notice, setNotice] = useState("");
  const updated = (text: string) => {
    setAction(null);
    setNotice(text);
    void queryClient.invalidateQueries({ queryKey: hostKey });
    void queryClient.invalidateQueries({
      queryKey: ["station-slots", booking.stationId],
    });
  };
  const update = useMutation({
    mutationFn: (values: {
      status: "IN_PROGRESS" | "COMPLETED";
      actualEnergyWh?: number;
    }) => send(`/bookings/${booking.id}/session`, "PATCH", values),
    onSuccess: (_value, variables) =>
      updated(
        variables.status === "COMPLETED"
          ? "Charging session completed."
          : "Charging session started.",
      ),
  });
  const cancel = useMutation({
    mutationFn: (reason: string) =>
      send(`/bookings/${booking.id}/cancel`, "POST", {
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => updated("Reservation cancelled."),
  });
  const error = update.error ?? cancel.error;
  const duration =
    (Date.parse(booking.end) - Date.parse(booking.start)) / 3_600_000;
  const capacity =
    powerKw === undefined
      ? 350
      : Math.floor(Math.round(powerKw * 1000) * duration) / 1000;
  return (
    <article className="db-booking">
      <div className="db-booking-head">
        <div>
          <h3>{booking.stationName}</h3>
          <p>
            {booking.ownerName ?? "EV owner"}
            {booking.sample ? " · Sample reservation" : ""} · {booking.id}
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
              : "Energy recorded"}
          </dt>
          <dd>{(booking.actualEnergyWh ?? booking.energyWh) / 1000} kWh</dd>
        </div>
        <div>
          <dt>
            {booking.finalPaise == null ? "Estimated cost" : "Final cost"}
          </dt>
          <dd>{money(booking.finalPaise ?? booking.totalPaise)}</dd>
        </div>
      </dl>
      {booking.cancelledAt && (
        <p className="db-help db-inline-form">
          Cancelled {dateTime(booking.cancelledAt)}
          {booking.cancellationReason ? ` · ${booking.cancellationReason}` : ""}
        </p>
      )}
      {error && <Notice>{dashboardError(error)}</Notice>}
      {notice && <Notice success>{notice}</Notice>}
      <div className="db-actions db-inline-form">
        {booking.status === "CONFIRMED" && (
          <button
            className="db-button"
            disabled={update.isPending}
            onClick={() => update.mutate({ status: "IN_PROGRESS" })}
          >
            Start session
          </button>
        )}
        {booking.status === "IN_PROGRESS" && (
          <button className="db-button" onClick={() => setAction("complete")}>
            Record energy and complete
          </button>
        )}
        {["PENDING", "CONFIRMED"].includes(booking.status) &&
          Date.parse(booking.start) > Date.now() && (
            <button
              className="db-button db-button-secondary"
              onClick={() => setAction("cancel")}
            >
              Cancel reservation
            </button>
          )}
      </div>
      {action === "complete" && (
        <form
          className="db-inline-form db-form"
          onSubmit={(event) => {
            event.preventDefault();
            const value = String(
              new FormData(event.currentTarget).get("energy"),
            );
            update.mutate({
              status: "COMPLETED",
              actualEnergyWh: toMinorUnit(value, 3),
            });
          }}
        >
          <p className="db-help">
            Manual energy entry. Enter energy delivered from the station meter.
            For a simulated session, enter the demo measurement.
          </p>
          <label className="db-field">
            Actual charging energy (kWh)
            <input
              name="energy"
              type="number"
              min={0}
              max={capacity}
              step="0.001"
              required
            />
          </label>
          <div className="db-actions">
            <button className="db-button" disabled={update.isPending}>
              Complete session
            </button>
            <button
              type="button"
              className="db-button db-button-secondary"
              onClick={() => setAction(null)}
            >
              Close energy form
            </button>
          </div>
        </form>
      )}
      {action === "cancel" && (
        <form
          className="db-inline-form db-form"
          onSubmit={(event) => {
            event.preventDefault();
            cancel.mutate(
              String(new FormData(event.currentTarget).get("reason") ?? ""),
            );
          }}
        >
          <label className="db-field">
            Cancellation reason
            <input name="reason" maxLength={300} />
          </label>
          <div className="db-actions">
            <button
              className="db-button db-button-danger"
              disabled={cancel.isPending}
            >
              Confirm cancellation
            </button>
            <button
              type="button"
              className="db-button db-button-secondary"
              onClick={() => setAction(null)}
            >
              Keep booking
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

function HostEarnings({
  earnings,
  completed,
}: {
  earnings: Earnings;
  completed: Booking[];
}) {
  return (
    <>
      <div className="db-stats">
        <Stat
          label="Estimated upcoming"
          value={money(earnings.estimatedPaise)}
          icon={CalendarDays}
        />
        <Stat
          label="Completed session revenue"
          value={money(earnings.completedPaise)}
          icon={CheckCircle2}
        />
        <Stat
          label="Platform fees"
          value={money(earnings.platformFeesPaise)}
          icon={CircleDollarSign}
        />
        <Stat
          label="Payout-eligible balance"
          value={money(earnings.eligiblePaise)}
          icon={CircleDollarSign}
        />
        <Stat
          label="Confirmed payouts"
          value={money(earnings.paidOutPaise)}
          icon={CircleDollarSign}
        />
        <Stat
          label="Delivered energy"
          value={`${earnings.energyWh / 1000} kWh`}
          icon={Zap}
        />
      </div>
      <Section
        title="Completed charging sessions"
        text="Balances reflect recorded sessions. Automated payouts are currently unavailable."
      >
        {completed.some(({ actualEnergyWh }) => actualEnergyWh != null) && (
          <Suspense fallback={<Loading />}>
            <EnergyChart sessions={completed} />
          </Suspense>
        )}
        {completed.length ? (
          <div className="db-table-scroll">
            <table className="db-table">
              <thead>
                <tr>
                  <th scope="col">Station</th>
                  <th scope="col">Session</th>
                  <th scope="col">Recorded energy</th>
                  <th scope="col">Final amount</th>
                  <th scope="col">Payment</th>
                </tr>
              </thead>
              <tbody>
                {completed.map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      {booking.stationName}
                      {booking.sample ? " · Sample" : ""}
                    </td>
                    <td>{dateTime(booking.start)}</td>
                    <td>
                      {booking.actualEnergyWh == null
                        ? "Unavailable"
                        : `${booking.actualEnergyWh / 1000} kWh`}
                    </td>
                    <td>
                      {booking.finalPaise == null
                        ? "Unavailable"
                        : money(booking.finalPaise)}
                    </td>
                    <td>
                      <Badge value={booking.paymentStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No completed sessions"
            text="Record energy use and complete a charging session to see it here."
          />
        )}
      </Section>
    </>
  );
}
