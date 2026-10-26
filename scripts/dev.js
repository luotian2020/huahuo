import { createServer as createViteServer } from "vite";
import { startPosebookServer } from "../server/index.js";

const apiServer = await startPosebookServer();
const viteServer = await createViteServer();
await viteServer.listen();
viteServer.printUrls();

let stopping = false;

async function stop() {
  if (stopping) return;
  stopping = true;
  await viteServer.close();
  await new Promise((resolve) => apiServer.close(resolve));
}

process.on("SIGINT", async () => {
  await stop();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await stop();
  process.exit(0);
});
