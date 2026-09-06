// Scratch script used once to render a preview of the gift email (see
// src/lib/emailGift.ts) to hand-check before wiring it live. Not imported
// by anything, not part of the app -- left here only because this folder
// doesn't allow file deletion. Safe to ignore/remove manually later.
import { renderGiftEmailHtml } from "./src/lib/emailGift.ts";
import fs from "fs";

fs.writeFileSync("/sessions/vibrant-elegant-carson/mnt/outputs/gift_email_monthly.html", renderGiftEmailHtml({ firstName: "Shikhar", plan: "monthly", priceLabel: "$6.99/month" }));
fs.writeFileSync("/sessions/vibrant-elegant-carson/mnt/outputs/gift_email_annual.html", renderGiftEmailHtml({ firstName: "Shikhar", plan: "annual", priceLabel: "$41.99/year" }));
console.log("done");
