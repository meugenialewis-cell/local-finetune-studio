import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Converted documents can produce large row payloads (POST /datasets/from-rows),
// so allow well beyond the 100kb default.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// When running locally (outside Replit), serve the built frontend from the
// same server so the whole app lives on one port. On Replit the frontend is
// served by its own Vite workflow, so this block is a no-op there unless a
// build output happens to exist — in which case it is still harmless because
// Replit only routes /api traffic to this server.
const staticDir =
  process.env["STATIC_DIR"] ??
  path.resolve(process.cwd(), "..", "finetune-studio", "dist", "public");
const indexHtml = path.join(staticDir, "index.html");

if (fs.existsSync(indexHtml)) {
  app.use(express.static(staticDir));
  // SPA fallback: any non-API GET that didn't match a static file gets
  // index.html so client-side routing works on refresh/deep links.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(indexHtml);
  });
  logger.info({ staticDir }, "Serving built frontend");
}

export default app;
