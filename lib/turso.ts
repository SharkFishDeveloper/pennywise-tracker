const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;

export function tursoConfigured() {
  return Boolean(url && token);
}

type SqlArg = string | number | null;
type SqlValue =
  | { type: "null" }
  | { type: "integer" | "float" | "text"; value: string }
  | { type: "blob"; base64: string };

type QueryResult = {
  type: string;
  response?: {
    result?: {
      cols?: { name: string }[];
      rows?: SqlValue[][];
    };
    error?: { message?: string };
  };
  error?: { message?: string };
};

function endpoint() {
  if (!url) throw new Error("TURSO_DATABASE_URL is not set");
  if (url.includes("://")) return `${url.replace(/^[^:]+:\/\//, "https://").replace(/\/$/, "")}/v2/pipeline`;
  return `https://${url.replace(/\/$/, "")}/v2/pipeline`;
}

function encodeArg(value: SqlArg): SqlValue {
  if (value === null) return { type: "null" };
  if (typeof value === "number") {
    return {
      type: Number.isInteger(value) ? "integer" : "float",
      value: String(value),
    };
  }
  return { type: "text", value };
}

function decodeValue(value: SqlValue): unknown {
  if (value.type === "null") return null;
  if (value.type === "blob") return value.base64;
  if (value.type === "integer" || value.type === "float") return Number(value.value);
  return value.value;
}

export async function query(sql: string, args: SqlArg[] = []): Promise<Record<string, unknown>[]> {
  if (!token) throw new Error("TURSO_AUTH_TOKEN is not set");
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql, args: args.map(encodeArg) } },
        { type: "close" },
      ],
    }),
    cache: "no-store",
  });

  const data = (await response.json()) as {
    message?: string;
    results?: QueryResult[];
  };
  if (!response.ok) throw new Error(data.message ?? `Turso request failed (${response.status})`);

  const result = data.results?.[0];
  if (!result) throw new Error("Turso returned no result");
  if (result.type === "error") throw new Error(result.error?.message ?? "Turso query failed");
  if (result.response?.error) throw new Error(result.response.error.message ?? "Turso query failed");

  const cols = result.response?.result?.cols ?? [];
  const rows = result.response?.result?.rows ?? [];
  return rows.map((cells) => {
    const row: Record<string, unknown> = {};
    cols.forEach((col, index) => {
      row[col.name] = decodeValue(cells[index]);
    });
    return row;
  });
}
