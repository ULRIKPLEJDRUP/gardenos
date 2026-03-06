"use client";

import dynamic from "next/dynamic";

const GardenMapClient = dynamic(() => import("./GardenMapClient").then((m) => m.GardenMapClient), {
  ssr: false,
});

export function GardenMap() {
  return <GardenMapClient />;
}
