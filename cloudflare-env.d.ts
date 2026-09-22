declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    JEV_DEMO_API_KEY?: string;
    JEV_DEMO_TOTAL_LIMIT?: string;
  }
}
