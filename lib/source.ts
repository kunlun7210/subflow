export type SubscriptionInputKind = "url" | "content";

export class SubscriptionLoadError extends Error {
  readonly code: "network" | "http" | "too-large";
  readonly ipHost: boolean;

  constructor(code: SubscriptionLoadError["code"], ipHost: boolean, message: string) {
    super(message);
    this.name = "SubscriptionLoadError";
    this.code = code;
    this.ipHost = ipHost;
  }
}

export interface LoadedSubscription {
  kind: SubscriptionInputKind;
  text: string;
  ipHost: boolean;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export function isHttpSubscriptionURL(value: string): boolean {
  const clean = value.trim();
  if (!clean || /[\r\n]/.test(clean)) return false;
  try {
    const url = new URL(clean);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch { return false; }
}

export function isIpSubscriptionURL(value: string): boolean {
  if (!isHttpSubscriptionURL(value)) return false;
  const hostname = new URL(value.trim()).hostname.replace(/^\[|\]$/g, "");
  if (hostname.includes(":")) return true;
  const parts = hostname.split(".");
  return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

export async function loadSubscriptionInput(value: string, fetcher: Fetcher = fetch): Promise<LoadedSubscription> {
  const clean = value.trim();
  if (!isHttpSubscriptionURL(clean)) return { kind: "content", text: clean, ipHost: false };

  const ipHost = isIpSubscriptionURL(clean);
  let response: Response;
  try {
    response = await fetcher(clean, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
  } catch {
    throw new SubscriptionLoadError("network", ipHost, "浏览器无法直接读取这条订阅链接");
  }
  if (!response.ok) throw new SubscriptionLoadError("http", ipHost, `订阅服务器返回 ${response.status}`);
  const text = await response.text();
  if (text.length > 5_000_000) {
    throw new SubscriptionLoadError("too-large", ipHost, "订阅内容超过 5 MB，为避免设备内存不足已停止读取");
  }
  return { kind: "url", text, ipHost };
}
