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
  const origin = (process.argv[2] ?? "https://kinetiqui.vercel.app").replace(
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
  const res = await fetch("https://api.indexnow.org/IndexNow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key: KEY,
      keyLocation: `${origin}/${KEY}.txt`,
      urlList,
    }),
  });
  console.log(
    `indexnow: ${urlList.length} url(s) submitted for ${host}: HTTP ${res.status}`,
  );
  if (res.status >= 300) throw new Error(await res.text());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
