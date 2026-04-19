import { z } from "zod";

const csvList = z
  .string()
  .default("")
  .transform((value) => value.split(",").map((entry) => entry.trim()).filter(Boolean));

const envSchema = z.object({
  FRONIUS_BASE_URL: z.string().url().default("http://192.168.70.79"),
  FRONIUS_USERNAME: z.string().default(""),
  FRONIUS_PASSWORD: z.string().default(""),
  HEATPUMP_HISTORY_DB_PATH: z.string().min(1).default("/app/data/heatpump-history.db"),
  LUXTRONIC_HOST: z.string().min(1).default("192.168.70.47"),
  LUXTRONIC_PORT: z.coerce.number().int().positive().default(8214),
  LUXTRONIC_PASSWORD: z.string().min(1),
  SHELLY_HT_DEVICES: csvList,
  SHELLY_GEN1_DEVICES: csvList,
  SHELLY_CLOUD_AUTH_TOKEN: z.string().default(""),
  PORT: z.coerce.number().int().positive().default(3001),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid environment variables: ${issues}`);
  }
  return result.data;
}

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function env(): Env {
  if (!cachedEnv) {
    cachedEnv = loadEnv();
  }
  return cachedEnv;
}