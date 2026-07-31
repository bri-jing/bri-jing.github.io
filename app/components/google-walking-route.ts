type Coordinate = readonly [longitude: number, latitude: number];

type GoogleDirectionalLocation = {
  lat?: number;
  lng?: number;
};

type GoogleRouteStep = {
  instructions?: string;
  distanceMeters?: number;
  endLocation?: GoogleDirectionalLocation;
};

type GoogleRoute = {
  distanceMeters?: number;
  durationMillis?: number;
  legs?: Array<{
    steps?: GoogleRouteStep[];
  }>;
};

type GoogleRoutesLibrary = {
  Route: {
    computeRoutes: (request: {
      origin: { lat: number; lng: number };
      destination: { lat: number; lng: number };
      travelMode: "WALKING";
      language: string;
      units: "METRIC";
      fields: string[];
    }) => Promise<{ routes?: GoogleRoute[] }>;
  };
};

type GoogleMapsApi = {
  importLibrary: (library: "routes") => Promise<GoogleRoutesLibrary>;
};

declare global {
  interface Window {
    google?: { maps?: GoogleMapsApi };
    __westLakeGoogleMapsReady?: () => void;
  }
}

export type GoogleWalkingRoute = {
  distanceMeters: number;
  durationMinutes: number;
  steps: Array<{
    instruction: string;
    distance?: number;
    endLocation?: { lng?: number; lat?: number };
  }>;
};

let googleMapsPromise: Promise<GoogleMapsApi> | null = null;

function loadGoogleMaps(key: string) {
  if (window.google?.maps?.importLibrary) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const parameters = new URLSearchParams({
      key,
      v: "weekly",
      loading: "async",
      callback: "__westLakeGoogleMapsReady",
    });
    const script = document.createElement("script");

    window.__westLakeGoogleMapsReady = () => {
      delete window.__westLakeGoogleMapsReady;
      const maps = window.google?.maps;
      if (maps?.importLibrary) resolve(maps);
      else reject(new Error("Google Maps did not initialize"));
    };

    script.src = `https://maps.googleapis.com/maps/api/js?${parameters}`;
    script.async = true;
    script.onerror = () => {
      delete window.__westLakeGoogleMapsReady;
      googleMapsPromise = null;
      reject(new Error("Google Maps failed to load"));
    };
    document.head.append(script);
  });

  return googleMapsPromise;
}

function plainText(value?: string) {
  if (!value) return "";
  const container = document.createElement("div");
  container.innerHTML = value;
  return container.textContent?.trim() ?? "";
}

export async function planGoogleWalkingRoute({
  key,
  origin,
  destination,
  language,
}: {
  key: string;
  origin: Coordinate;
  destination: Coordinate;
  language: "zh-CN" | "en";
}): Promise<GoogleWalkingRoute | null> {
  const maps = await loadGoogleMaps(key);
  const { Route } = await maps.importLibrary("routes");
  const { routes } = await Route.computeRoutes({
    origin: { lng: origin[0], lat: origin[1] },
    destination: { lng: destination[0], lat: destination[1] },
    travelMode: "WALKING",
    language,
    units: "METRIC",
    fields: ["distanceMeters", "durationMillis", "legs"],
  });
  const route = routes?.[0];
  if (!route) return null;

  const steps =
    route.legs
      ?.flatMap((leg) => leg.steps ?? [])
      .map((step) => ({
        instruction: plainText(step.instructions),
        distance: step.distanceMeters,
        endLocation: step.endLocation
          ? { lng: step.endLocation.lng, lat: step.endLocation.lat }
          : undefined,
      }))
      .filter((step) => step.instruction) ?? [];

  if (steps.length === 0) return null;

  return {
    distanceMeters: Math.round(route.distanceMeters ?? 0),
    durationMinutes: Math.max(
      1,
      Math.round((route.durationMillis ?? 0) / 60_000),
    ),
    steps,
  };
}
