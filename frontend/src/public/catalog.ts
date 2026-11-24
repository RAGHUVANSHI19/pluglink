export interface ChargingStation {
  id: string;
  name: string;
  city: string;
  locality: string;
  address: string;
  description: string;
  connector: string;
  chargerType?: string;
  timezone?: string;
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
  distanceKm?: number;
}

export interface StationReview {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  sample: boolean;
  authorName: string;
}

export interface ChargingSlot {
  start: string;
  end: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const sampleImages: Record<string, string> = {
  "Vaishali Nagar": "station-1",
  Mansarovar: "station-2",
  "Malviya Nagar": "station-3",
  Jagatpura: "station-4",
  "C-Scheme": "station-5",
  "Raja Park": "station-6",
};

export function stationImage(station: ChargingStation) {
  return (
    station.imageUrls?.[0] ||
    (station.sample
      ? `/images/${sampleImages[station.locality] || "station-1"}.webp`
      : "")
  );
}

export function stationDate(date = new Date(), timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function slotTime(timestamp: string, timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function errorText(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  return error instanceof Error ? error.message : fallback;
}
