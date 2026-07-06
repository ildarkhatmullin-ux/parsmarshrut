import fs from "fs/promises";
import path from "path";
import { Parser } from "json2csv";
import { RouteData, slugifyTitle } from "./scraper.js"; // Note: .js extension for nodenext resolution but wait, tsx automatically resolves so we might not need .js, but .ts is fine mostly. Actually I am using typescript config without emit.

export async function saveRouteFiles(route: RouteData, regionDir: string) {
  if (route.status !== "success" || route.polyline.length === 0) return;

  const titleSlug = slugifyTitle(route.title);
  const baseName = `${route.source_id}-${titleSlug}`;

  // GPX
  const gpxDir = path.join(regionDir, "gpx");
  await fs.mkdir(gpxDir, { recursive: true });
  const gpxPath = path.join(gpxDir, `${baseName}.gpx`);
  
  let gpxPts = route.polyline.map(p => `      <trkpt lat="${p[0]}" lon="${p[1]}"></trkpt>`).join("\n");
  const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="idilesom-parser">
  <metadata>
    <name><![CDATA[${route.title}]]></name>
  </metadata>
  <trk>
    <name><![CDATA[${route.title}]]></name>
    <trkseg>
${gpxPts}
    </trkseg>
  </trk>
</gpx>`;
  await fs.writeFile(gpxPath, gpxContent, "utf-8");
  route.gpx_path = gpxPath;

  // KML
  const kmlDir = path.join(regionDir, "kml");
  await fs.mkdir(kmlDir, { recursive: true });
  const kmlPath = path.join(kmlDir, `${baseName}.kml`);
  
  let kmlPts = route.polyline.map(p => `${p[1]},${p[0]},0`).join(" ");
  const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name><![CDATA[${route.title}]]></name>
    <Placemark>
      <name><![CDATA[${route.title}]]></name>
      <description><![CDATA[${route.description}]]></description>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${kmlPts}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
  await fs.writeFile(kmlPath, kmlContent, "utf-8");
  route.kml_path = kmlPath;
}

export async function saveRegionData(regionSlug: string, routes: RouteData[]) {
  const regionDir = path.join(process.cwd(), "data", "regions", regionSlug);
  await fs.mkdir(regionDir, { recursive: true });

  // JSON
  await fs.writeFile(path.join(regionDir, "routes.json"), JSON.stringify(routes, null, 2), "utf-8");

  // CSV
  if (routes.length > 0) {
    const csvData = routes.map(r => ({
      source_id: r.source_id,
      source_url: r.source_url,
      source_site: r.source_site,
      region_slug: r.region_slug,
      region_name: r.region_name,
      title: r.title,
      description: r.description,
      tags: r.tags.join(" | "),
      distance_km: r.distance_km,
      start_lat: r.start_coords ? r.start_coords[0] : "",
      start_lng: r.start_coords ? r.start_coords[1] : "",
      end_lat: r.end_coords ? r.end_coords[0] : "",
      end_lng: r.end_coords ? r.end_coords[1] : "",
      points_count: r.points_count,
      json_path: path.join("data", "regions", regionSlug, "routes.json"),
      gpx_path: r.gpx_path || "",
      kml_path: r.kml_path || "",
      status: r.status,
      error: r.error || ""
    }));

    try {
      const parser = new Parser();
      const csv = parser.parse(csvData);
      await fs.writeFile(path.join(regionDir, "routes.csv"), csv, "utf-8");
    } catch(e) {
      console.error("Error saving region CSV:", e);
    }
  }
}

export async function saveGlobalIndex(allRoutes: RouteData[], duplicates: any[], errors: any[]) {
  const indexDir = path.join(process.cwd(), "data", "index");
  await fs.mkdir(indexDir, { recursive: true });

  await fs.writeFile(path.join(indexDir, "all_routes.json"), JSON.stringify(allRoutes, null, 2), "utf-8");
  if (duplicates.length) await fs.writeFile(path.join(indexDir, "duplicates.json"), JSON.stringify(duplicates, null, 2), "utf-8");
  if (errors.length) await fs.writeFile(path.join(indexDir, "errors.json"), JSON.stringify(errors, null, 2), "utf-8");

  if (allRoutes.length > 0) {
    const csvData = allRoutes.map(r => ({
      source_id: r.source_id,
      source_url: r.source_url,
      source_site: r.source_site,
      region_slug: r.region_slug,
      region_name: r.region_name,
      title: r.title,
      description: r.description,
      tags: r.tags.join(" | "),
      distance_km: r.distance_km,
      start_lat: r.start_coords ? r.start_coords[0] : "",
      start_lng: r.start_coords ? r.start_coords[1] : "",
      end_lat: r.end_coords ? r.end_coords[0] : "",
      end_lng: r.end_coords ? r.end_coords[1] : "",
      points_count: r.points_count,
      json_path: path.join("data", "regions", r.region_slug, "routes.json"),
      gpx_path: r.gpx_path || "",
      kml_path: r.kml_path || "",
      status: r.status,
      error: r.error || ""
    }));

    try {
      const parser = new Parser();
      const csv = parser.parse(csvData);
      await fs.writeFile(path.join(indexDir, "tropame_import.csv"), csv, "utf-8");
    } catch(e) {
      console.error("Error saving global CSV:", e);
    }
  }
}
