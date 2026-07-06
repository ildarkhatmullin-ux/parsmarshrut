import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { ScrapeController } from "./src/controller.js";

dotenv.config();

const port = process.env.DISABLE_HMR ? 3000 : (process.env.LOCAL_PORT || 3000);
const controller = new ScrapeController();

async function startServer() {
  const app = express();
  
  app.use(express.json());

  app.get("/api/state", (req, res) => {
    const fullState = controller.getState();
    const stateForClient = {
      ...fullState,
      routes: fullState.routes.map(r => ({
        ...r,
        polyline: r.polyline ? r.polyline.slice(0, 5) : [] // Send only preview to save bandwidth
      }))
    };
    res.json(stateForClient);
  });

  app.post("/api/start", (req, res) => {
    if (controller.getState().status === "RUNNING") {
      res.status(400).json({ error: "Already running" });
      return;
    }
    controller.start().catch(console.error);
    res.json({ message: "Started" });
  });

  app.post("/api/pause", (req, res) => {
    controller.pause();
    res.json({ message: "Paused" });
  });

  app.post("/api/resume", (req, res) => {
    controller.resume();
    res.json({ message: "Resumed" });
  });

  app.post("/api/stop", (req, res) => {
    controller.stop();
    res.json({ message: "Stopped" });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

startServer();
