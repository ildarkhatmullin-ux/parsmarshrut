import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs/promises";
import path from "path";
import { Parser } from "json2csv";

const COOKIE = process.env.IDILESOM_COOKIE || "";

export interface RouteData {
  source_id: string;
  source_url: string;
  source_site: string;
  region_slug: string;
  region_name: string;
  title: string;
  description: string;
  tags: string[];
  image_url?: string;
  distance_km: number | null;
  start_coords: number[] | null;
  end_coords: number[] | null;
  polyline: number[][];
  points_count: number;
  gpx_path?: string;
  kml_path?: string;
  status: 'success' | 'error' | 'queued' | 'pending';
  error?: string | null;
  scraped_at?: string;
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomDelay() {
  return Math.floor(Math.random() * (100000 - 15000 + 1)) + 15000;
}

export function slugifyTitle(title: string): string {
  const tr: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  let slug = title.toLowerCase().split('').map(c => tr[c] || c).join('');
  slug = slug.replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
  return slug.substring(0, 80).replace(/-$/, '');
}

export async function getRegionsList(): Promise<string[]> {
  try {
    const data = await fs.readFile('regions.txt', 'utf-8');
    const urls = data.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
    if (urls.length > 0) return urls;
  } catch (e) {
    // Ignore error, fallback below
  }
  return ["https://idilesom.com/perm/places"];
}

async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  const agentStr = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36";
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, {
        headers: {
          "Cookie": COOKIE,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36" // keep it explicit just in case
        },
        timeout: 10000,
        // maxRedirects: 0, 
        validateStatus: (status) => status >= 200 && status < 400
      });
      return response;
    } catch (e: any) {
      if (i === retries - 1) throw e;
      await sleep(1000 * (i + 1));
    }
  }
  throw new Error("Failed to fetch");
}

export async function parseRoute(url: string, log?: (level: string, message: string, color?: string, levelColor?: string) => void): Promise<RouteData> {
  const idStr = url.split("/").filter(Boolean).pop() || "unknown";
  const urlParts = new URL(url).pathname.split("/").filter(Boolean);
  const regionSlug = urlParts.length >= 3 ? urlParts[0] : "unknown";

  try {
    if (log) log("FETCHING", new URL(url).pathname, "text-white");
    const response = await fetchWithRetry(url);
    const html = response.data;
    const $ = cheerio.load(html);

    if (log) log("PARSING", "Cheerio DOM traversal...", undefined, "text-blue-400");
    
    let regionObj = $("ol[itemtype='https://schema.org/BreadcrumbList'] span[itemprop='name']").first().text().trim();
    if (regionObj.toLowerCase() === 'главная' || regionObj.toLowerCase() === 'home') {
      regionObj = $("ol[itemtype='https://schema.org/BreadcrumbList'] span[itemprop='name']").eq(1).text().trim();
    }
    if (!regionObj) {
      regionObj = regionSlug;
    }

    let title = $(".placeBox_descrTitle").first().text().trim();
    if (!title) title = $("h1").text().trim();
    if (!title) {
      const og = $("meta[property='og:title']").attr("content");
      if (og && !og.includes("ИдиЛесом. Путеводитель")) title = og;
    }
    if (!title) {
      const tTag = $("title").text();
      let t = tTag.split(".")[0].replace("ИдиЛесом", "").replace(/^[\s-]+/, '').trim();
      if (t) title = t;
    }
    if (!title) title = idStr;

    let distance: number | null = null;
    const distanceMatch = html.match(/(\d+(?:[.,]\d+)?)\s*км/i);
    if (distanceMatch) {
      distance = parseFloat(distanceMatch[1].replace(",", "."));
    }

    const descHtml = $("div[itemprop='text']").html();
    let description = "";
    if (descHtml) {
      const cheerioBrRemoved = cheerio.load(descHtml.replace(/<br\s*[\/]?>/gi, '\n'));
      description = cheerioBrRemoved.text().trim();
    }
    if (!description) {
      description = $("meta[property='og:description']").attr("content") || $("p").first().text().trim() || "";
    }

    const tags: string[] = [];
    $("li.descr_tags").each((i, el) => {
      tags.push($(el).text().trim());
    });

    let image_url = $("meta[property='og:image']").attr("content") || undefined;
    if (image_url && image_url.includes('no-image')) {
        image_url = undefined;
    }
    
    let polyline: number[][] = [];
    const polylineRegex = /polyline\s*=\s*new\s*L\.Polyline\(\s*(\[\[[\s\S]*?\]\])\s*(?:,|\))/;
    const match = html.match(polylineRegex);
    
    if (match && match[1]) {
      try {
        polyline = JSON.parse(match[1]);
      } catch (e: any) {
        if (log) log('ERROR', `Error parsing polyline JSON: ${e.message}`, 'text-red-500', 'text-red-500');
      }
    }

    let startCoords = polyline.length > 0 ? polyline[0] : null;
    let endCoords = polyline.length > 0 ? polyline[polyline.length - 1] : null;

    if (!startCoords) {
      const markerMatch = html.match(/L\.marker\(\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/);
      if (markerMatch && markerMatch[1] && markerMatch[2]) {
        startCoords = [parseFloat(markerMatch[1]), parseFloat(markerMatch[2])];
        endCoords = [parseFloat(markerMatch[1]), parseFloat(markerMatch[2])];
      }
    }

    if (!startCoords) {
      throw new Error("Route without coordinates (Skipped)");
    }

    if (log) log("MAP", `Found ${polyline.length} points in L.Polyline. Marker coords: ${startCoords ? startCoords.join(',') : 'none'}`, "text-blue-400");

    return {
      source_id: idStr,
      source_url: url,
      source_site: "idilesom.com",
      region_slug: regionSlug,
      region_name: regionObj,
      title,
      description,
      tags: [...new Set(tags)],
      image_url,
      distance_km: distance,
      start_coords: startCoords,
      end_coords: endCoords,
      polyline,
      points_count: polyline.length,
      status: 'success',
      error: null,
      scraped_at: new Date().toISOString()
    };
  } catch (error: any) {
    if (log) log('ERROR', `Error parsing ${url}: ${error.message}`, 'text-red-500', 'text-red-500');
    return {
      source_id: idStr,
      source_url: url,
      source_site: "idilesom.com",
      region_slug: regionSlug,
      region_name: regionSlug,
      title: "",
      description: "",
      tags: [],
      image_url: undefined,
      distance_km: null,
      start_coords: null,
      end_coords: null,
      polyline: [],
      points_count: 0,
      status: 'error',
      error: error.message,
      scraped_at: new Date().toISOString()
    };
  }
}
