import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { money } from "../lib";
import { type ChargingStation, type Coordinates } from "./catalog";

const jaipur: L.LatLngTuple = [26.8956, 75.8055];

export default function StationMap({
  stations,
  coordinates,
  selectedId,
  onSelect,
}: {
  stations: ChargingStation[];
  coordinates?: Coordinates;
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!container.current) return;
    const view = L.map(container.current, { scrollWheelZoom: false }).setView(
      jaipur,
      12,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
    }).addTo(view);
    map.current = view;
    const observer = new ResizeObserver(() =>
      view.invalidateSize({ pan: false }),
    );
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      view.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const view = map.current;
    if (!view) return;
    const layer = L.layerGroup().addTo(view);
    const created = new Map<string, L.Marker>();
    const points: L.LatLngTuple[] = [];
    for (const station of stations) {
      if (
        !Number.isFinite(station.latitude) ||
        !Number.isFinite(station.longitude)
      )
        continue;
      const position: L.LatLngTuple = [station.latitude, station.longitude];
      const marker = L.marker(position, {
        icon: L.divIcon({
          className: "pl-map-marker",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
        title: station.name,
        alt: station.name,
      }).addTo(layer);
      const popup = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = station.name;
      const details = document.createElement("p");
      details.textContent = `${station.locality} · ${money(station.pricePaise)}/kWh`;
      const link = document.createElement("a");
      link.href = `/chargers/${encodeURIComponent(station.id)}`;
      link.textContent = "View station";
      popup.append(name, details, link);
      marker.bindPopup(popup).on("click", () => onSelect?.(station.id));
      created.set(station.id, marker);
      points.push(position);
    }
    if (coordinates) {
      const userPosition: L.LatLngTuple = [
        coordinates.latitude,
        coordinates.longitude,
      ];
      L.circleMarker(userPosition, {
        color: "#fff",
        fillColor: "#2563eb",
        fillOpacity: 1,
        radius: 8,
        weight: 3,
      })
        .bindTooltip("Your location")
        .addTo(layer);
      points.push(userPosition);
    }
    if (points.length === 1) view.setView(points[0], 14);
    if (points.length > 1)
      view.fitBounds(points, { padding: [25, 25], maxZoom: 15 });
    if (!points.length) view.setView(jaipur, 12);
    markers.current = created;
    return () => {
      layer.remove();
    };
  }, [stations, coordinates, onSelect]);

  useEffect(() => {
    if (selectedId) markers.current.get(selectedId)?.openPopup();
  }, [selectedId]);

  return (
    <div
      className="pl-map"
      ref={container}
      role="region"
      aria-label="Charging station map"
    />
  );
}
