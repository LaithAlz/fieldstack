import type { MetadataRoute } from "next";
import { getAllVenues } from "@/lib/venues";

const BASE = "https://getonside.ca";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const venues = await getAllVenues();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, priority: 1, changeFrequency: "weekly" },
    { url: `${BASE}/venues`, priority: 0.9, changeFrequency: "daily" },
    { url: `${BASE}/support`, priority: 0.3, changeFrequency: "monthly" },
    { url: `${BASE}/privacy`, priority: 0.2, changeFrequency: "yearly" },
    { url: `${BASE}/terms`, priority: 0.2, changeFrequency: "yearly" },
  ];

  const venuePages: MetadataRoute.Sitemap = venues.map((v) => ({
    url: `${BASE}/venues/${v.slug}`,
    priority: 0.7,
    changeFrequency: "weekly",
  }));

  return [...staticPages, ...venuePages];
}
