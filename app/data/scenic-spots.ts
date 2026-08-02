export type GuideMode = "visual" | "hearing";

export type ScenicSpotZone = {
  id: string;
  name: string;
  nameEn: string;
  coordinate: readonly [longitude: number, latitude: number];
  triggerRadiusMeters: number;
  routes: Partial<Record<GuideMode, string>>;
};

// AMap POI coordinates (GCJ-02), retrieved from AMap Place Search on 2026-08-02.
export const scenicSpotZones: readonly ScenicSpotZone[] = [
  {
    id: "quyuan-fenghe",
    name: "曲院风荷",
    nameEn: "Quyuan Garden",
    coordinate: [120.133333, 30.249287],
    triggerRadiusMeters: 100,
    routes: {
      visual: "/visual/quyuan-fenghe",
      hearing: "/hearing/quyuan-fenghe",
    },
  },
  {
    id: "sudi-chunxiao",
    name: "苏堤春晓",
    nameEn: "Spring Dawn at Su Causeway",
    coordinate: [120.13796, 30.24388],
    triggerRadiusMeters: 100,
    routes: {
      visual: "/visual/sudi-chunxiao",
    },
  },
  {
    id: "pinghu-qiuyue",
    name: "平湖秋月",
    nameEn: "Autumn Moon over the Calm Lake",
    coordinate: [120.146142, 30.252244],
    triggerRadiusMeters: 100,
    routes: {
      visual: "/visual/pinghu-qiuyue",
    },
  },
  {
    id: "duanqiao-canxue",
    name: "断桥残雪",
    nameEn: "Lingering Snow on Broken Bridge",
    coordinate: [120.151347, 30.258151],
    triggerRadiusMeters: 100,
    routes: {
      visual: "/visual/duanqiao-canxue",
    },
  },
];

export function distanceInMeters(
  first: readonly [number, number],
  second: readonly [number, number],
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const latitudeDelta = toRadians(second[1] - first[1]);
  const longitudeDelta = toRadians(second[0] - first[0]);
  const firstLatitude = toRadians(first[1]);
  const secondLatitude = toRadians(second[1]);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}
