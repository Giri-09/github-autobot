import "dotenv/config";
import dns from "node:dns";
import net from "node:net";
import { Pool } from "pg";

// Prefer IPv4 and skip racing IPv6 - avoids hanging on networks with broken IPv6 routing
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// Pooled connection - used for normal app queries at runtime
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
