// One-off diagnostic: hit the SET upcoming-IPO API the same way the scraper
// does (Chrome TLS fingerprint + Incapsula cookies) and report, per symbol,
// whether `financialAdvisors` and `underwriters` are present. Confirms whether
// the empty lead_uw in the DB is a SET-source gap or a parser bug.
import https from "node:https";

const SET_BASE = "https://www.set.or.th";
const SET_PAGE = `${SET_BASE}/th/listing/ipo/upcoming-ipo/set`;
const SET_API = `${SET_BASE}/api/set/ipo/upcoming`;

const CHROME_CIPHERS = [
  "TLS_AES_128_GCM_SHA256",
  "TLS_AES_256_GCM_SHA384",
  "TLS_CHACHA20_POLY1305_SHA256",
  "ECDHE-ECDSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-ECDSA-AES256-GCM-SHA384",
  "ECDHE-RSA-AES256-GCM-SHA384",
  "ECDHE-ECDSA-CHACHA20-POLY1305",
  "ECDHE-RSA-CHACHA20-POLY1305",
  "ECDHE-RSA-AES128-SHA",
  "ECDHE-RSA-AES256-SHA",
  "AES128-GCM-SHA256",
  "AES256-GCM-SHA384",
  "AES128-SHA",
  "AES256-SHA",
].join(":");

const agent = new https.Agent({ ciphers: CHROME_CIPHERS, minVersion: "TLSv1.2", keepAlive: true });

const CHROME_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
  "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};

function get(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        port: 443,
        agent,
        headers: { ...CHROME_HEADERS, ...opts.headers },
        timeout: 20000,
      },
      (res) => {
        const max = opts.maxRedirects ?? 5;
        if (max > 0 && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          get(new URL(res.headers.location, url).href, { ...opts, maxRedirects: max - 1 })
            .then(resolve)
            .catch(reject);
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf-8") }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

function cookies(headers) {
  const raw = headers["set-cookie"];
  if (!raw) return "";
  return (Array.isArray(raw) ? raw : [raw]).map((c) => c.split(";")[0]).join("; ");
}

const page = await get(SET_PAGE, {
  headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
});
const cookie = cookies(page.headers);
console.log(`page status=${page.statusCode} cookies=${cookie ? "yes" : "no"}`);

for (const type of ["SET", "mai"]) {
  const resp = await get(`${SET_API}?type=${type}&lang=th`, {
    headers: { Accept: "application/json, text/plain, */*", Referer: SET_PAGE, ...(cookie ? { Cookie: cookie } : {}) },
  });
  console.log(`\n=== ${type} (status ${resp.statusCode}) ===`);
  if (resp.statusCode !== 200) {
    console.log(resp.body.slice(0, 300));
    continue;
  }
  const data = JSON.parse(resp.body);
  const items = Array.isArray(data) ? data : data?.data ?? [];
  for (const it of items) {
    const fa = it.financialAdvisors;
    const uw = it.underwriters;
    console.log(
      `${(it.symbol || "?").padEnd(8)} | FA=${Array.isArray(fa) ? fa.length : JSON.stringify(fa)} | UW=${Array.isArray(uw) ? uw.length : JSON.stringify(uw)} | keys=${Object.keys(it).filter((k) => /under|advisor|uw/i.test(k)).join(",")}`,
    );
  }
}
