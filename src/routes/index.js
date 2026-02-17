import express from "express";
import emailRoutes from "./emailRoutes.js";

const router = express.Router();

// Email routes (Gmail IMAP/SMTP)
router.use("/", emailRoutes);

export default router;
