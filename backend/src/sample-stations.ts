export const sampleStations = [
  ['greencharge', 'GreenCharge Home Station', 'Vaishali Nagar', 7_400, 1_200, 26.911, 75.736, 'Type 2',
    'A covered demo charging bay on the west side of Jaipur, designed for convenient top-ups near Vaishali Nagar.'],
  ['ecovolt', 'EcoVolt Charging Point', 'Mansarovar', 7_400, 1_000, 26.852, 75.753, 'Type 2',
    'An easy-to-reach demo charging stop in Mansarovar with a dedicated parking bay.'],
  ['powernest', 'PowerNest EV Charging', 'Malviya Nagar', 3_300, 900, 26.851, 75.809, '15A Socket',
    'A neighborhood demonstration of low-power charging for compatible portable chargers.'],
  ['chargeease', 'ChargeEase Home Charger', 'Jagatpura', 7_400, 1_100, 26.828, 75.842, 'Type 2',
    'A residential demo charging setup for drivers traveling through south-east Jaipur.'],
  ['urbanvolt', 'UrbanVolt Charging Hub', 'C-Scheme', 11_000, 1_400, 26.913, 75.795, 'CCS2',
    'A demonstration station near central Jaipur with a dedicated charging space and a higher power rating.'],
  ['ecoplug', 'EcoPlug Residential Charging', 'Raja Park', 3_300, 800, 26.892, 75.83, '15A Socket',
    'A sample residential charging bay for compatible portable EV charging equipment.'],
] as const;

export const exampleStations = sampleStations.map(
  ([id, name, locality, powerWatts, pricePaise, latitude, longitude, connector, description], index) => ({
    id: `example-${id}`,
    name,
    city: 'Jaipur',
    locality,
    address: `${locality}, Jaipur`,
    description,
    connector,
    chargerType: connector === 'CCS2' ? 'DC charging' : 'AC home charging',
    powerKw: powerWatts / 1_000,
    pricePaise,
    feePaise: 2_000,
    latitude,
    longitude,
    imageUrls: [`/images/station-${index + 1}.webp`],
    timezone: 'Asia/Kolkata',
    sample: true,
    catalogExample: true,
    hostName: 'PlugLink Demo',
    rating: null,
    reviewCount: 0,
    available: false,
  }),
);

export function findExampleStation(id: string) {
  return exampleStations.find((station) => station.id === id);
}
