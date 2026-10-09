import express from "express";
import cors from "cors";
import "dotenv/config";
import { randomUUID } from "node:crypto";
import supabase from "./config/supabase.js";

import authRouter from "./routes/authRoutes.js";
import pigBatchRouter from "./routes/pigRoutes.js";
import feedRouter from "./routes/feedRoutes.js";
import vaccinationRouter from "./routes/vaccineRoutes.js";
import expensesRouter from "./routes/expensesRoutes.js";
import reportRouter from "./routes/reportRoutes.js";
import notificationRouter from "./routes/notificationRoutes.js";
import marketPriceRouter from "./routes/marketPriceRoutes.js";

import "./scheduler.js";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters');
}

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://it332-capstone-pre-p-apig-backup.vercel.app",
  "https://it332-capstone-pre-p-apig-backup-7ylyz2whd-angelo0960s-projects.vercel.app",
  ...(process.env.CLIENT_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use((req, res, next) => {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  const startedAt = Date.now();
  res.on('finish', () => console.log(JSON.stringify({
    event: 'http_request', requestId, method: req.method,
    path: req.originalUrl, status: res.statusCode, durationMs: Date.now() - startedAt,
  })));
  next();
});

app.use((req, res, next) => {
  req.setTimeout(30_000, () => {
    if (!res.headersSent) res.status(408).json({ success: false, message: 'Request timed out', requestId: req.requestId });
  });
  next();
});

// Routes
app.use("/auth", authRouter);
app.use("/pigs", pigBatchRouter);
app.use("/feeds", feedRouter);
app.use("/vaccinations", vaccinationRouter);
app.use("/expenses", expensesRouter);
app.use("/reports", reportRouter);
app.use("/notifications", notificationRouter);
app.use("/market-prices", marketPriceRouter);

// Root Route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "PrepAPig Backend API is running.",
  });
});

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', service: 'PrepAPig Backend API' });
});

app.get('/health/ready', async (req, res) => {
  const { error } = await supabase.from('pig_batches').select('id', { head: true, count: 'exact' });
  if (error) return res.status(503).json({ success: false, status: 'not_ready', requestId: req.requestId });
  return res.json({ success: true, status: 'ready' });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((err, req, res, next) => {
  console.error(JSON.stringify({ event: 'request_error', requestId: req.requestId, message: err.message }));
  if (res.headersSent) return next(err);
  const status = err.statusCode || err.status || 500;
  return res.status(status).json({
    success: false,
    message: status >= 500 ? 'Internal server error' : err.message,
    requestId: req.requestId,
  });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

const shutdown = (signal) => {
  console.log(JSON.stringify({ event: 'shutdown_started', signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));