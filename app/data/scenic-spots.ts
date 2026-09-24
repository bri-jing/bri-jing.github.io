export type Coordinate = readonly [longitude: number, latitude: number];
export type GuideMode = "visual";

export type ScenicSpotZone = {
  id: string;
  name: string;
  nameEn: string;
  coordinate: readonly [longitude: number, latitude: number];
  triggerRadiusMeters: number;
  routes: Record<GuideMode, string>;
  poiId?: string;
  walkingDestination?: { name: string; nameEn: string; coordinate: Coordinate; poiId: string };
};

// GCJ-02 coordinates from AMap Place Search. First four: 2026-08-02; remaining POIs: 2026-09-23.
// Island geofences and mainland walking destinations intentionally differ.
export const scenicSpotZones: readonly ScenicSpotZone[] = [
  {
    id: "quyuan-fenghe",
    name: "曲院风荷",
    nameEn: "Quyuan Garden",
    coordinate: [120.133333, 30.249287],
    triggerRadiusMeters: 100,
    routes: {
      visual: "/visual/quyuan-fenghe",
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
  {
    id: "liulang-wenying", name: "柳浪闻莺", nameEn: "Orioles Singing in the Willows",
    coordinate: [120.156326, 30.240389], poiId: "B023B0247C", triggerRadiusMeters: 100,
    routes: { visual: "/visual/liulang-wenying" },
  },
  {
    id: "huagang-guanyu", name: "花港观鱼", nameEn: "Viewing Fish at Flower Harbor",
    coordinate: [120.139095, 30.230233], poiId: "B023B023B2", triggerRadiusMeters: 100,
    routes: { visual: "/visual/huagang-guanyu" },
  },
  {
    id: "shuangfeng-chayun", name: "双峰插云", nameEn: "Twin Peaks Piercing the Clouds",
    coordinate: [120.122581, 30.247511], poiId: "B023B025E0", triggerRadiusMeters: 100,
    routes: { visual: "/visual/shuangfeng-chayun" },
  },
  {
    id: "santan-yinyue", name: "三潭印月", nameEn: "Three Pools Mirroring the Moon",
    coordinate: [120.145369, 30.238845], poiId: "B023B0283D", triggerRadiusMeters: 100,
    routes: { visual: "/visual/santan-yinyue" },
    walkingDestination: { name: "三潭印月花港观鱼码头", nameEn: "Huagang Guanyu boat pier", coordinate: [120.143207, 30.231184], poiId: "B023B18MLB" },
  },
  {
    id: "leifeng-xizhao", name: "雷峰夕照", nameEn: "Leifeng Pagoda",
    coordinate: [120.148849, 30.230934], poiId: "B023B09LKR", triggerRadiusMeters: 100,
    routes: { visual: "/visual/leifeng-xizhao" },
  },
  {
    id: "nanping-wanzhong", name: "南屏晚钟", nameEn: "Jingci Temple",
    coordinate: [120.149165, 30.228643], poiId: "B023B015DA", triggerRadiusMeters: 100,
    routes: { visual: "/visual/nanping-wanzhong" },
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
