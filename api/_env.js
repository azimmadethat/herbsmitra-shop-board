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
    BREAK_EVEN_ROAS: process.env.BREAK_EVEN_ROAS || "",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    BOARD_DESIGN: process.env.BOARD_DESIGN || "",
    BOARD_KV: undefined,
  };
}
