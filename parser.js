import { ScrapeController } from "./src/controller.js";

async function main() {
  const controller = new ScrapeController();
  await controller.start();
}

main();
