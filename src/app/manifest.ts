import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Home Dashboard",
    short_name: "Dashboard",
    description: "Home dashboard for Fronius, Shelly, and Luxtronic devices.",
    start_url: "/",
    display: "standalone",
    background_color: "#22292b",
    theme_color: "#22292b",
    orientation: "landscape",
    icons: [
      {
        src: "/images/pv.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}