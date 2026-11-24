import { BatteryCharging, MapPin, Star, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { money } from "../lib";
import { stationImage, type ChargingStation } from "./catalog";

export function StationCard({ station }: { station: ChargingStation }) {
  const image = stationImage(station);
  return (
    <article className="pl-station-card">
      <Link
        className="pl-station-image"
        to={`/chargers/${station.id}`}
        tabIndex={-1}
        aria-hidden="true"
      >
        {image ? (
          <img src={image} alt="" loading="lazy" />
        ) : (
          <BatteryCharging size={38} />
        )}
        {station.sample && <span className="pl-image-label">Demo listing</span>}
      </Link>
      <div className="pl-station-content">
        <div className="pl-station-heading">
          <h3>
            <Link to={`/chargers/${station.id}`}>{station.name}</Link>
          </h3>
          {Number(station.reviewCount) > 0 && station.rating != null && (
            <span className="pl-rating">
              <Star size={15} fill="currentColor" aria-hidden="true" />{" "}
              {Number(station.rating).toFixed(1)}
            </span>
          )}
        </div>
        <p className="pl-station-location">
          <MapPin size={16} aria-hidden="true" /> {station.locality},{" "}
          {station.city}
          {station.distanceKm != null && (
            <span> · {Number(station.distanceKm).toFixed(1)} km</span>
          )}
        </p>
        <div className="pl-station-specs">
          <span>
            <Zap size={15} aria-hidden="true" /> {station.powerKw} kW
          </span>
          <span>{station.connector}</span>
          <span className={station.available ? "pl-open-tag" : ""}>
            {station.available ? "Open slots" : "No open slots"}
          </span>
        </div>
        <div className="pl-station-price">
          <span>
            <strong>{money(station.pricePaise)}</strong> / kWh
          </span>
          <Link className="pl-card-link" to={`/chargers/${station.id}`}>
            View station
          </Link>
        </div>
      </div>
    </article>
  );
}

export function StationLoading() {
  return (
    <div className="pl-station-skeleton" role="status">
      Loading charging stations…
    </div>
  );
}
