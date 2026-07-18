import express from "express";
import cors from "cors";
import "dotenv/config";

import authRouter from "./routes/authRoutes.js";
import pigBatchRouter from "./routes/pigRoutes.js";
import feedRouter from "./routes/feedRoutes.js";
import vaccinationRouter from "./routes/vaccineRoutes.js";
import expensesRouter from "./routes/expensesRoutes.js";
import reportRouter from "./routes/reportRoutes.js";
import notificationRouter from "./routes/notificationRoutes.js";

import "./scheduler.js";  

// Initialize Express
const app = express();

// Middleware
app.use(
  cors({
    origin: [
      'http://localhost:5173',           // local dev
      'https://it332-capstone-pre-p-apig-backup.vercel.app', // your Vercel frontend
    ],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
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

// Root Route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "PrepAPig Backend API is running.",
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Start Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});