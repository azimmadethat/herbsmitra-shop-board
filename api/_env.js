export function getEnv() {
  return {
    WC_URL: process.env.WC_URL || "",
    WC_KEY: process.env.WC_KEY || "",
    WC_SECRET: process.env.WC_SECRET || "",
    BOARD_KEY: process.env.BOARD_KEY || "",
    STORE_NAME: process.env.STORE_NAME || "",
    STORE_TZ: process.env.STORE_TZ || "",
    META_TOKEN: process.env.META_TOKEN || "",
    META_AD_ACCOUNT: process.env.META_AD_ACCOUNT || "",
    BREAK_EVEN_ROAS: process.env.BREAK_EVEN_ROAS || "2.0",
    COST_PER_ORDER_TARGET: process.env.COST_PER_ORDER_TARGET || "84.70",
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || "",
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || "",
    NEON_DATABASE_URL: process.env.NEON_DATABASE_URL || "",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    BOARD_DESIGN: process.env.BOARD_DESIGN || "classic",
    BOARD_KV: undefined,
  };
}
