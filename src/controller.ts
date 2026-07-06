import { getRegionsList, parseRoute, randomDelay, sleep, RouteData } from "./scraper.js";
import { saveRouteFiles, saveRegionData, saveGlobalIndex } from "./export.js";
import { scrapeRegionList } from "./region_scraper.js";

export interface LogMsg {
  time: string;
  level: string;
  message: string;
  color?: string;
  levelColor?: string;
}

export interface ProcessState {
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'COMPLETED' | 'ERROR';
  logs: LogMsg[];
  regionsProcessed: number;
  routesSaved: number;
  duplicatesSkipped: number;
  errorsFound: number;
  coordsCached: number;
  routes: RouteData[];
  duration?: number;
}

interface DuplicateLog {
  source_id: string;
  source_url: string;
  reason: string;
  detected_at: string;
}

export class ScrapeController {
  state: ProcessState = {
    status: 'IDLE',
    logs: [],
    regionsProcessed: 0,
    routesSaved: 0,
    duplicatesSkipped: 0,
    errorsFound: 0,
    coordsCached: 0,
    routes: []
  };

  private duplicates: DuplicateLog[] = [];
  private errorsLog: any[] = [];
  private seenIds = new Set<string>();
  private seenUrls = new Set<string>();
  private seenHashes = new Set<string>();
  
  private isPaused = false;
  private isStopped = false;
  private unpauseResolver: (() => void) | null = null;

  constructor() {}

  getState() {
    return this.state;
  }

  pause() {
    if (this.state.status === 'RUNNING') {
        this.isPaused = true;
        this.state.status = 'PAUSED';
        this.log('INFO', 'Scraper paused.', 'text-yellow-400');
    }
  }

  resume() {
    if (this.state.status === 'PAUSED') {
        this.isPaused = false;
        this.state.status = 'RUNNING';
        if (this.unpauseResolver) {
            this.unpauseResolver();
            this.unpauseResolver = null;
        }
        this.log('INFO', 'Scraper resumed.', 'text-green-400');
    }
  }

  stop() {
    if (this.state.status === 'RUNNING' || this.state.status === 'PAUSED') {
        this.isStopped = true;
        this.isPaused = false;
        if (this.unpauseResolver) {
            this.unpauseResolver();
            this.unpauseResolver = null;
        }
        this.state.status = 'STOPPED';
        this.log('INFO', 'Scraper stopped by user.', 'text-red-500');
    }
  }

  private async checkWait() {
    while (this.isPaused) {
      await new Promise<void>(resolve => { this.unpauseResolver = resolve; });
    }
  }

  log = (level: string, message: string, color?: string, levelColor?: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    this.state.logs.push({ time, level, message, color, levelColor });
    console.log(`[${time}] ${level}: ${message}`);
  };

  async start() {
    if (this.state.status === 'RUNNING') return;
    
    this.isPaused = false;
    this.isStopped = false;
    this.unpauseResolver = null;
    this.state.status = 'RUNNING';
    this.state.logs = [];
    this.state.regionsProcessed = 0;
    this.state.routesSaved = 0;
    this.state.duplicatesSkipped = 0;
    this.state.errorsFound = 0;
    this.state.coordsCached = 0;
    this.state.routes = [];
    this.duplicates = [];
    this.errorsLog = [];
    this.seenIds.clear();
    this.seenUrls.clear();
    this.seenHashes.clear();
    
    const startTime = Date.now();
    this.log('INFO', 'Initializing parser...', undefined, 'text-[#f27d26]');
    
    try {
      const fs = (await import('fs/promises')).default;
      const existingData = await fs.readFile('data/index/all_routes.json', 'utf8');
      const existingRoutes: RouteData[] = JSON.parse(existingData);
      for (const r of existingRoutes) {
        if (r.status === 'success') {
          this.seenIds.add(r.source_id);
          const urlBase = r.source_url.endsWith("/") ? r.source_url.slice(0, -1) : r.source_url;
          this.seenUrls.add(urlBase);
          const hash = `${r.title}-${r.region_name}-${r.distance_km}-${r.start_coords?.[0]}-${r.start_coords?.[1]}`;
          this.seenHashes.add(hash);
          this.state.routes.push(r);
          this.state.routesSaved++;
          this.state.coordsCached += r.points_count;
        }
      }
      this.log('INFO', `Loaded ${this.seenIds.size} existing routes from memory.`, 'text-blue-400');
    } catch (e) {
      this.log('INFO', 'No existing memory found, starting fresh.', 'text-gray-400');
    }

    try {
      const regionUrls = await getRegionsList();
      this.log('INFO', `Found ${regionUrls.length} regions in regions.txt`, 'text-white', 'text-blue-400');
      
      const allRoutes: RouteData[] = [...this.state.routes];

      for (const regionUrl of regionUrls) {
        await this.checkWait();
        if (this.isStopped) break;

        this.log('REGION', `Starting processing for ${regionUrl}`, 'text-purple-400', 'text-purple-400');
        const urls = await scrapeRegionList(regionUrl, this.log);
        
        const regionSlug = new URL(regionUrl).pathname.split("/").filter(Boolean)[0] || "unknown";
        const regionRoutes: RouteData[] = this.state.routes.filter(r => r.region_slug === regionSlug);
        this.log('INFO', `Found ${regionRoutes.length} existing routes in memory for region ${regionSlug}`, 'text-gray-400');
        this.state.regionsProcessed++;

        for (let i = 0; i < urls.length; i++) {
          await this.checkWait();
          if (this.isStopped) break;

          const url = urls[i];
          const urlBase = url.endsWith("/") ? url.slice(0, -1) : url;
          const idStr = urlBase.split("/").pop() || "unknown";

          // Checking basic known identities early
          if (this.seenIds.has(idStr)) {
            this.log('DUPLICATE', `skipped route ID ${idStr} (Duplicate ID)`, 'text-yellow-500', 'text-yellow-500');
            this.state.duplicatesSkipped++;
            this.duplicates.push({ source_id: idStr, source_url: url, reason: "Duplicate ID", detected_at: new Date().toISOString() });
            continue;
          }
          if (this.seenUrls.has(urlBase)) {
            this.log('DUPLICATE', `skipped route ID ${idStr} (Duplicate URL)`, 'text-yellow-500', 'text-yellow-500');
            this.state.duplicatesSkipped++;
            this.duplicates.push({ source_id: idStr, source_url: url, reason: "Duplicate URL", detected_at: new Date().toISOString() });
            continue;
          }

          const route = await parseRoute(url, this.log);
          
          if (route.status === 'success') {
            const hash = `${route.title}-${route.region_name}-${route.distance_km}-${route.start_coords?.[0]}-${route.start_coords?.[1]}`;
            if (this.seenHashes.has(hash)) {
              this.log('DUPLICATE', `skipped route ID ${route.source_id} (Duplicate Content Hash)`, 'text-yellow-500', 'text-yellow-500');
              this.state.duplicatesSkipped++;
              this.duplicates.push({ source_id: route.source_id, source_url: url, reason: "Duplicate Content Hash", detected_at: new Date().toISOString() });
              continue;
            }
            
            this.seenIds.add(route.source_id);
            this.seenUrls.add(urlBase);
            this.seenHashes.add(hash);
            
            this.state.coordsCached += route.points_count;
            this.state.routesSaved++;
            
            regionRoutes.push(route);
            allRoutes.push(route);
            this.state.routes.push(route); // Show in UI

            const regionDir = `data/regions/${route.region_slug}`;
            await saveRouteFiles(route, regionDir);
            this.log('FILE', `Saved files for ${route.source_id} to ${regionDir}/`, undefined, 'text-green-500');
          } else {
            this.state.errorsFound++;
            this.errorsLog.push(route);
            this.state.routes.push(route);
          }

          if (i < urls.length - 1) {
            const delayMs = randomDelay();
            this.log('WAIT', `pause ${(delayMs / 1000).toFixed(1)}s before next route`, 'text-yellow-400', 'text-yellow-400');
            await sleep(delayMs);
          }
        } // items loop

        // Sort region routes
        regionRoutes.sort((a, b) => a.title.localeCompare(b.title, "ru"));
        
        if (regionRoutes.length > 0) {
           await saveRegionData(regionRoutes[0].region_slug, regionRoutes);
           this.log('FILE', `Saved region JSON and CSV for ${regionRoutes[0].region_name}`, undefined, 'text-green-500');
        }
      } // regions loop

      // Sort all final routes
      allRoutes.sort((a, b) => {
        const rc = a.region_name.localeCompare(b.region_name, "ru");
        if (rc !== 0) return rc;
        return a.title.localeCompare(b.title, "ru");
      });

      await saveGlobalIndex(allRoutes, this.duplicates, this.errorsLog);
      this.log('FILE', 'Writing global index files: all_routes.json, tropame_import.csv', undefined, 'text-green-500');
      
      this.state.duration = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));
      if (!this.isStopped) {
        this.state.status = 'COMPLETED';
      }

    } catch (err: any) {
      this.log("ERROR", `Fatal error during scraping: ${err.message}`, "text-red-500", "text-red-500");
      this.state.status = 'ERROR';
    }
  }
}
