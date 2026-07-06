import axios from "axios";
import * as cheerio from "cheerio";
import { sleep } from "./scraper.js";

const COOKIE = process.env.IDILESOM_COOKIE || "";

export async function scrapeRegionList(
  startUrl: string, 
  log?: (level: string, msg: string, color?: string, levelColor?: string) => void
): Promise<string[]> {
  const routesSet = new Set<string>();
  const visitedPages = new Set<string>();
  
  let currentUrl = startUrl;
  const baseUrl = new URL(startUrl).origin;
  const regionPath = new URL(startUrl).pathname; // e.g., /perm/places

  let pagesProcessed = 0;
  
  // Use a simple queue for pagination
  const pagesQueue: string[] = [startUrl];

  while (pagesQueue.length > 0 && pagesProcessed < 300) {
    const url = pagesQueue.shift()!;
    if (visitedPages.has(url)) continue;
    visitedPages.add(url);
    pagesProcessed++;
    
    if (log) log("FETCHING", `Region list page: ${new URL(url).pathname}${new URL(url).search}`, "text-white");
    
    try {
      const response = await axios.get(url, {
        headers: {
          "Cookie": COOKIE,
          "User-Agent": "Mozilla/5.0"
        },
        timeout: 10000
      });
      const $ = cheerio.load(response.data);

      // Collect route links
      $("a").each((_, el) => {
        let href = $(el).attr("href");
        if (!href) return;
        
        // Remove trailing slash for uniformity
        href = href.replace(/\/$/, "");

        // Determine if it's a route by parsing the URL
        try {
          const parsedUrl = new URL(href, baseUrl);
          
          if (parsedUrl.origin === baseUrl && parsedUrl.pathname.startsWith(regionPath)) {
             const routeRegex = new RegExp(`^${regionPath}/\\d+$`);
             if (routeRegex.test(parsedUrl.pathname)) {
               routesSet.add(parsedUrl.href);
             }

             // Collect pagination links inside the region
             if (parsedUrl.pathname === regionPath && parsedUrl.search.includes('page=')) {
               if (!visitedPages.has(parsedUrl.href) && !pagesQueue.includes(parsedUrl.href)) {
                 pagesQueue.push(parsedUrl.href);
               }
             }
          }
        } catch (e) {
          // invalid url
        }
      });

      // Avoid getting blocked
      if (pagesQueue.length > 0) {
        await sleep(2000); 
      }

    } catch (e: any) {
      if (log) log("ERROR", `Failed to fetch region list ${url}: ${e.message}`, "text-red-500", "text-red-500");
    }
  }

  if (log) log("INFO", `Found ${routesSet.size} unique route URLs in region after ${pagesProcessed} pages`);
  return Array.from(routesSet);
}
