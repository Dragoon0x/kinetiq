/**
 * Tells the IndexNow engines (Bing, Yandex, Seznam, Naver and their
 * partners) which URLs changed, so a deploy is crawled in hours rather than
 * whenever the sitemap is next read. Google does not take IndexNow; it
 * reads the sitemap named in robots.txt on its own schedule.
 *
 * The key is proven by a file at the site root holding the same value.
 * Usage: tsx scripts/indexnow.ts [origin]
 */
const KEY = "541b5c0b7bee626976c0aa3261840784";

async function main() {
  const origin = (process.argv[2] ?? "https://www.kinetiqui.com").replace(
    /\/$/,
    "",
  );
  const host = new URL(origin).host;

  const proof = await fetch(`${origin}/${KEY}.txt`);
  if (!proof.ok || (await proof.text()).trim() !== KEY) {
    throw new Error(`key file not served at ${origin}/${KEY}.txt`);
  }

  const sitemap = await (await fetch(`${origin}/sitemap.xml`)).text();
  const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => m[1],
  );
  if (urlList.length === 0) throw new Error("sitemap listed no urls");

  // The protocol caps a submission at 10,000 URLs; the sitemap is far under.
  // The first submission after a deploy is sometimes refused while the
  // endpoint fetches the key file, so a refusal is retried before it counts.
  const body = JSON.stringify({
    host,
    key: KEY,
    keyLocation: `${origin}/${KEY}.txt`,
    urlList,
  });
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch("https://api.indexnow.org/IndexNow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body,
    });
    if (res.status < 300) {
      console.log(
        `indexnow: ${urlList.length} url(s) submitted for ${host}: HTTP ${res.status}`,
      );
      return;
    }
    last = `HTTP ${res.status} ${(await res.text()).trim()}`.trim();
    console.warn(`indexnow: attempt ${attempt} refused (${last})`);
    await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
  }
  throw new Error(`indexnow: submission refused after 3 attempts: ${last}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
