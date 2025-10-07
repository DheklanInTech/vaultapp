import express from "express";
import {
  createTransaction,
  deleteTransaction,
  getSummaryByUserId,
  getTransactionsByUserId,
} from "../controllers/transactionController.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.get("/:userId", requireAuth, getTransactionsByUserId);
router.post("/", requireAuth, createTransaction);
router.delete("/:id", requireAuth, deleteTransaction);
router.get("/summary/:userId", requireAuth, getSummaryByUserId);

export default router;
