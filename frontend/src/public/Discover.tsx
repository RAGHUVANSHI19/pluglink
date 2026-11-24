import { useQuery } from "@tanstack/react-query";
import {
  Filter,
  List,
  LocateFixed,
  Map as MapIcon,
  Search,
  X,
} from "lucide-react";
import { lazy, Suspense, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib";
import { errorText, type ChargingStation, type Coordinates } from "./catalog";
import { StationCard, StationLoading } from "./StationCard";

const StationMap = lazy(() => import("./StationMap"));
const noStations: ChargingStation[] = [];
const pageSize = 24;

export function Discover() {
  const [params, setParams] = useSearchParams();
  const currentSearch = params.get("q") ?? "";
  const [searchDraft, setSearchDraft] = useState({
    value: currentSearch,
    query: currentSearch,
  });
  const searchText =
    searchDraft.query === currentSearch ? searchDraft.value : currentSearch;
  const setSearchText = (value: string) =>
    setSearchDraft({ value, query: currentSearch });
  const [view, setView] = useState<"list" | "map">("list");
  const [coordinates, setCoordinates] = useState<Coordinates>();
  const [locationMessage, setLocationMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [showFilters, setShowFilters] = useState(false);

  const filters = {
    connector: params.get("connector") ?? "",
    maxPrice: params.get("maxPrice") ?? "",
    minPower: params.get("minPower") ?? "",
    available: params.get("available") === "true" ? "true" : "",
    sort: params.get("sort") ?? "rating",
  };
  const requestedOffset = Number(params.get("offset"));
  const offset =
    Number.isSafeInteger(requestedOffset) &&
    requestedOffset >= 0 &&
    requestedOffset <= 10_000
      ? requestedOffset
      : 0;
  const query = new URLSearchParams({
    offset: String(offset),
    limit: String(pageSize),
  });
  if (currentSearch) query.set("q", currentSearch);
  for (const [key, setting] of Object.entries(filters))
    if (setting) query.set(key, setting);
  if (coordinates) {
    query.set("lat", String(coordinates.latitude));
    query.set("lng", String(coordinates.longitude));
  }
  const serialized = query.toString();
  const catalog = useQuery({
    queryKey: ["stations", serialized],
    queryFn: ({ signal }) =>
      api<{ stations: ChargingStation[]; total: number }>(
        `/stations?${serialized}`,
        { signal },
      ),
  });
  const stations = catalog.data?.stations ?? noStations;
  const total = catalog.data?.total ?? 0;
  const selectedStation = stations.find((station) => station.id === selectedId);
  const hasFilters = Boolean(
    filters.connector ||
    filters.maxPrice ||
    filters.minPower ||
    filters.available,
  );

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (key !== "offset") next.delete("offset");
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
    setSelectedId(undefined);
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilter("q", searchText.trim());
  }

  function locate() {
    if (!navigator.geolocation) {
      setLocationMessage(
        "Location is unavailable in this browser. Search by city or locality instead.",
      );
      return;
    }
    setLocating(true);
    setLocationMessage("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setLocating(false);
        setFilter("sort", "distance");
        setLocationMessage("Distances use your current location.");
      },
      () => {
        setLocating(false);
        setLocationMessage(
          "We couldn’t get your location. You can still search by city or locality.",
        );
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }

  function clearFilters() {
    const next = new URLSearchParams(params);
    for (const key of [
      "connector",
      "maxPrice",
      "minPower",
      "available",
      "offset",
    ])
      next.delete(key);
    setParams(next);
    setSelectedId(undefined);
  }

  return (
    <div className="pl-discover pl-shell">
      <div className="pl-page-title">
        <h1>Find Chargers</h1>
        <p>
          Search local charging stations and compare prices, connectors, and
          booking options.
        </p>
      </div>

      <div className="pl-search-panel">
        <form className="pl-discover-search" onSubmit={search}>
          <div className="pl-search-field">
            <Search size={20} aria-hidden="true" />
            <label className="pl-visually-hidden" htmlFor="pl-discover-search">
              Search by city, locality, or station
            </label>
            <input
              id="pl-discover-search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search by city, locality, or station"
            />
          </div>
          <button className="pl-btn pl-btn-primary" type="submit">
            Search
          </button>
        </form>
        <button
          className="pl-btn pl-btn-outline"
          type="button"
          onClick={locate}
          disabled={locating}
        >
          <LocateFixed size={18} aria-hidden="true" />
          {locating ? "Finding location…" : "Use my location"}
        </button>
      </div>
      {params.get("nearby") === "1" && !locationMessage && (
        <p className="pl-location-feedback">
          Share your location to sort chargers by distance.
        </p>
      )}
      {locationMessage && (
        <p className="pl-location-feedback" role="status">
          {locationMessage}
        </p>
      )}

      <button
        type="button"
        className="pl-btn pl-btn-outline pl-mobile-filter"
        aria-expanded={showFilters}
        aria-controls="pl-charger-filters"
        onClick={() => setShowFilters(!showFilters)}
      >
        <Filter size={17} aria-hidden="true" /> Filters
      </button>
      <div
        className={`pl-filters${showFilters ? " pl-filters-open" : ""}`}
        id="pl-charger-filters"
      >
        <label>
          Connector
          <select
            value={filters.connector}
            onChange={(event) => setFilter("connector", event.target.value)}
          >
            <option value="">Any connector</option>
            <option value="Type 2">Type 2</option>
            <option value="CCS2">CCS2</option>
            <option value="Type 1">Type 1</option>
            <option value="Bharat AC-001">Bharat AC-001</option>
            <option value="15A Socket">15A socket</option>
            <option value="CHAdeMO">CHAdeMO</option>
          </select>
        </label>
        <label>
          Max. price
          <select
            value={filters.maxPrice}
            onChange={(event) => setFilter("maxPrice", event.target.value)}
          >
            <option value="">Any price</option>
            <option value="10">₹10/kWh</option>
            <option value="12">₹12/kWh</option>
            <option value="15">₹15/kWh</option>
            <option value="20">₹20/kWh</option>
          </select>
        </label>
        <label>
          Min. power
          <select
            value={filters.minPower}
            onChange={(event) => setFilter("minPower", event.target.value)}
          >
            <option value="">Any power</option>
            <option value="3">3 kW</option>
            <option value="7">7 kW</option>
            <option value="11">11 kW</option>
          </select>
        </label>
        <label className="pl-checkbox">
          <input
            type="checkbox"
            checked={Boolean(filters.available)}
            onChange={(event) =>
              setFilter("available", event.target.checked ? "true" : "")
            }
          />{" "}
          Has open slots
        </label>
        {hasFilters && (
          <button
            className="pl-inline-button"
            type="button"
            onClick={clearFilters}
          >
            <X size={15} aria-hidden="true" /> Clear filters
          </button>
        )}
      </div>

      <div className="pl-discover-results">
        <h2 aria-live="polite">
          {catalog.isPending
            ? "Charging stations"
            : `${total} ${total === 1 ? "station" : "stations"}`}
        </h2>
        <div className="pl-discover-controls">
          <label className="pl-sort-label">
            Sort by
            <select
              value={filters.sort}
              onChange={(event) => setFilter("sort", event.target.value)}
            >
              <option value="rating">Rating</option>
              <option value="price">Price</option>
              <option value="distance" disabled={!coordinates}>
                Distance
              </option>
            </select>
          </label>
          <div
            className="pl-view-switch"
            role="group"
            aria-label="Results view"
          >
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List size={18} aria-hidden="true" /> List
            </button>
            <button
              type="button"
              aria-pressed={view === "map"}
              onClick={() => setView("map")}
            >
              <MapIcon size={17} aria-hidden="true" /> Map
            </button>
          </div>
        </div>
      </div>

      {catalog.isPending && <StationLoading />}
      {catalog.isError && (
        <div className="pl-state" role="alert">
          {errorText(catalog.error, "We couldn’t load charging stations.")}{" "}
          <button
            type="button"
            className="pl-inline-button"
            onClick={() => void catalog.refetch()}
          >
            Try again
          </button>
        </div>
      )}
      {catalog.isSuccess && (
        <>
          {view === "map" && (
            <Suspense
              fallback={
                <p className="pl-state" role="status">
                  Loading the map…
                </p>
              }
            >
              <div className="pl-discover-map">
                <StationMap
                  stations={stations}
                  coordinates={coordinates}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
                {selectedStation && (
                  <div className="pl-map-selection">
                    <StationCard station={selectedStation} />
                  </div>
                )}
              </div>
            </Suspense>
          )}
          {stations.length ? (
            <div
              className={`pl-station-grid${view === "map" ? " pl-map-list" : ""}`}
            >
              {stations.map((station) => (
                <div className="pl-map-card-wrap" key={station.id}>
                  <StationCard station={station} />
                  {view === "map" && (
                    <button
                      type="button"
                      className="pl-inline-button pl-map-card-link"
                      aria-pressed={station.id === selectedId}
                      onClick={() => setSelectedId(station.id)}
                    >
                      Show {station.name} on map
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="pl-state">
              <h3>No stations match your search</h3>
              <p>Try a nearby locality or change your filters.</p>
              <Link
                className="pl-btn pl-btn-outline"
                to="/chargers"
                onClick={() => setSearchText("")}
              >
                Browse all chargers
              </Link>
            </div>
          )}
          {(total > pageSize || offset > 0) && (
            <nav
              className="pl-catalog-pagination"
              aria-label="Charging station pages"
            >
              <button
                type="button"
                className="pl-btn pl-btn-outline"
                disabled={!offset}
                onClick={() =>
                  setFilter(
                    "offset",
                    offset > pageSize ? String(offset - pageSize) : "",
                  )
                }
              >
                Previous
              </button>
              <span>
                {stations.length
                  ? `${offset + 1}–${offset + stations.length} of ${total}`
                  : `${total} stations`}
              </span>
              <button
                type="button"
                className="pl-btn pl-btn-outline"
                disabled={offset + pageSize >= total}
                onClick={() => setFilter("offset", String(offset + pageSize))}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
