import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initDB } from "./config/db.js";
import rateLimiter from "./middleware/rateLimiter.js";

import transactionsRoute from "./routes/transactionsRoute.js";
import authRoute from "./routes/authRoute.js";
import adminRoute from "./routes/adminRoute.js";
import paymentWalletsRoute from "./routes/paymentWalletsRoute.js";
import { requireAuth } from "./middleware/auth.js";
import { me, updateMe } from "./controllers/authController.js";
import job from "./config/cron.js";

dotenv.config();

const app = express();

// Avoid starting cron on serverless platform
if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
  job.start();
}

// middleware
app.use(rateLimiter);
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRoute);
app.use("/api/transactions", transactionsRoute);
app.use("/api/admin", adminRoute);
app.use("/api", paymentWalletsRoute);

// Also expose /api/me to match app client paths
app.get("/api/me", requireAuth, me);
app.patch("/api/me", requireAuth, updateMe);


export const ready = process.env.DATABASE_URL ? initDB() : Promise.resolve();

export { PORT };
export default app;
