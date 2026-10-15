// Mainspring feed job.
// Runs on GitHub every two hours: reads every feed in feeds.json, keeps the
// watch stories, finds each one's cover image, tags brands and topics, groups
// articles about the same watch, and writes feed.json for the app.
//
// Run locally with:  node fetch.mjs
// Environment (optional): FEEDS_FILE, OUT_FILE, NOW (ISO date, for tests)

import Parser from "rss-parser";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const FEEDS_FILE = process.env.FEEDS_FILE || new URL("./feeds.json", import.meta.url);
const OUT_FILE = process.env.OUT_FILE || new URL("./feed.json", import.meta.url);
const NOW = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();
const KEEP_DAYS = 30;          // how long stories stay in the app
const NEW_WINDOW_DAYS = 4;     // only add items published this recently
const MAX_ITEMS = 700;
const IMAGE_LOOKUPS = +(process.env.IMAGE_LOOKUPS ?? 90);     // article pages fetched per run to find a missing cover image
const UA = "Mainspring/1.0 (personal feed reader)";
const DAY = 864e5;

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

// [display name, regex source]. Matched against title, URL slug and categories.
const BRANDS = [
  ["A. Lange & Söhne", "a\\.? ?lange|lange (?:&|and) s[oö]hne|\\blange\\b"], ["Audemars Piguet", "audemars|\\broyal oak\\b"],
  ["Accutron", "accutron"], ["Angelus", "angelus"], ["Anordain", "anordain"], ["Armin Strom", "armin strom"],
  ["Arnold & Son", "arnold (?:&|and) son"], ["ArtyA", "artya"], ["Atowak", "atowak"], ["Auctor", "\\bauctor\\b"],
  ["Awake", "\\bawake\\b"], ["Ba111od", "ba111od|baillod"], ["Baltic", "\\bbaltic\\b"], ["Baume & Mercier", "baume (?:&|and|et) mercier"],
  ["Bell & Ross", "bell (?:&|and) ross"], ["Bianchet", "bianchet"], ["Blancpain", "blancpain|fifty fathoms"], ["Bovet", "\\bbovet\\b"],
  ["Breguet", "breguet"], ["Breitling", "breitling|navitimer"], ["Bremont", "bremont"], ["Bulgari", "bulgari|bvlgari"],
  ["Bulova", "bulova"], ["Cartier", "cartier"], ["Chanel", "chanel"], ["Chopard", "chopard"], ["Christopher Ward", "christopher ward"],
  ["Citizen", "citizen|eco-drive"], ["Corum", "\\bcorum\\b"], ["Cyma", "\\bcyma\\b"], ["Czapek", "czapek"], ["De Bethune", "de bethune"],
  ["Doxa", "\\bdoxa\\b"], ["Ebel", "\\bebel\\b"], ["F.P. Journe", "journe"], ["Farer", "\\bfarer\\b"], ["Favre Leuba", "favre[- ]leuba"],
  ["Formex", "formex"], ["Fortis", "\\bfortis\\b"], ["Frederique Constant", "fr[eé]d[eé]rique constant"], ["Furlan Marri", "furlan marri"],
  ["G-Shock", "g-?shock|\\bmr-?g\\b"], ["Gallet", "\\bgallet\\b"], ["Garmin", "garmin"], ["Gerald Charles", "gerald charles"],
  ["Girard-Perregaux", "girard[- ]perregaux"], ["Glashütte Original", "glash[uü]tte original"], ["Grand Seiko", "grand seiko"],
  ["Greubel Forsey", "greubel"], ["Grönefeld", "gr[oö]nefeld"], ["H. Moser & Cie", "\\bmoser\\b"], ["Hamilton", "hamilton"],
  ["Hanhart", "hanhart"], ["Hermès", "herm[eè]s"], ["Hublot", "hublot"], ["IWC", "\\biwc\\b|portugieser|ingenieur"],
  ["Jacob & Co.", "jacob (?:&|and) co"], ["Jaeger-LeCoultre", "jaeger|\\bjlc\\b|reverso"], ["Jaquet Droz", "jaquet droz"],
  ["Junghans", "junghans"], ["Kudoke", "kudoke"], ["Lang & Heyne", "lang (?:&|and) heyne"], ["Laurent Ferrier", "laurent ferrier"],
  ["Longines", "longines"], ["Lorier", "\\blorier\\b"], ["Louis Erard", "louis erard"], ["Louis Vuitton", "louis vuitton|\\blv\\b"],
  ["MB&F", "\\bmb ?& ?f\\b|mbandf|\\bmbf\\b|legacy machine"], ["Massena LAB", "massena"], ["Maurice Lacroix", "maurice lacroix|aikon"],
  ["MeisterSinger", "meistersinger"], ["Mido", "\\bmido\\b"], ["Ming", "\\bming\\b"], ["Montblanc", "montblanc"], ["Movado", "movado"],
  ["Nodus", "\\bnodus\\b"], ["Nomos", "\\bnomos\\b"], ["Norqain", "norqain"], ["Omega", "\\bomega\\b|speedmaster|seamaster|moonswatch"],
  ["Oris", "\\boris\\b"], ["Panerai", "panerai|luminor"], ["Parmigiani", "parmigiani"], ["Patek Philippe", "patek"],
  ["Perrelet", "perrelet"], ["Piaget", "piaget"], ["Rado", "\\brado\\b"], ["Ralph Lauren", "ralph lauren"], ["Raymond Weil", "raymond weil"],
  ["Ressence", "ressence"], ["RGM", "\\brgm\\b"], ["Richard Mille", "richard mille"], ["Roger Dubuis", "roger dubuis"],
  ["Rolex", "rolex|submariner|daytona|datejust|day-date"], ["Seiko", "(?<!grand )seiko"], ["Sinn", "\\bsinn\\b"],
  ["Sternglas", "sternglas"], ["Swatch", "\\bswatch\\b"], ["TAG Heuer", "tag ?heuer"], ["Timex", "\\btimex\\b"], ["Tissot", "tissot"],
  ["Titan", "\\btitan\\b"], ["Toledano & Chan", "toledano"], ["Trematic", "trematic"], ["Tudor", "\\btudor\\b"], ["Tutima", "tutima"],
  ["Ulysse Nardin", "ulysse nardin"], ["Unimatic", "unimatic"], ["Universal Genève", "universal gen[eè]ve"],
  ["Urban Jürgensen", "urban j[uü]rgensen"], ["Urwerk", "urwerk"], ["Vacheron Constantin", "vacheron"], ["Van Cleef & Arpels", "van cleef"],
  ["Wren", "\\bwren\\b"], ["Yema", "\\byema\\b"], ["Zenith", "\\bzenith\\b"], ["Apple", "apple watch"],
].map(([name, re]) => [name, new RegExp(re, "i")]);

const INDEPENDENTS = new Set(["MB&F", "Urwerk", "Czapek", "F.P. Journe", "Ming", "Kudoke", "Grönefeld", "De Bethune", "Toledano & Chan",
  "Laurent Ferrier", "Greubel Forsey", "Ressence", "Urban Jürgensen", "Armin Strom", "H. Moser & Cie", "RGM", "Bianchet", "ArtyA",
  "Lang & Heyne", "Massena LAB", "Anordain"]);
const MICRO = new Set(["Baltic", "Lorier", "Nodus", "Furlan Marri", "Christopher Ward", "Farer", "Unimatic", "Wren", "Auctor", "Awake",
  "Trematic", "Sternglas", "Atowak", "Formex"]);

const TOPICS = [
  ["Dive", /\bdive|\bdiver|diving|submariner|seamaster|pelagos|fifty fathoms|skin ?diver/i],
  ["Chronograph", /chronograph|\bchrono\b|flyback|daytona|speedmaster|\bpanda\b/i],
  ["GMT & world time", /\bgmt\b|world ?-?time|worldtimer|dual[- ]time|two[- ]time|traveller/i],
  ["High complications", /tourbillon|minute repeater|perpetual|grand complication|sonnerie|c[oô]nillon|rattrapante|split[- ]seconds|equation of time/i],
  ["Dials & métiers d'art", /enamel|lacquer|guilloch|cloisonn|m[ée]tiers? d.art|meteorite|aventurine|mother[- ]of[- ]pearl|\bonyx\b|stone dial|engrav|marquetry|porcelain|s[ơo]n m[àa]i/i],
  ["Integrated bracelet", /integrated[- ]bracelet|royal oak|nautilus|overseas|\b70s\b|seventies|aikon/i],
  ["Pilot & field", /\bpilot|aviat|flieger|field watch|military/i],
  ["Dress", /\bdress\b|calatrava|senator|ultra[- ]?thin|ultrafino/i],
  ["Smartwatches", /smartwatch|garmin|apple watch|\bmarq\b/i],
  ["Quartz & solar", /quartz|solar|eco-drive|light-powered|spring drive/i],
  ["Movements & technique", /\bmovement|calibre|caliber|in-house|finishing|escapement|\bcosc\b|chronometer|hairspring/i],
  ["Materials", /titanium|ceramic|bronze|carbon|fibreglass|fiberglass|bioceramic|tantalum|sapphire case/i],
  ["Vintage & reissues", /vintage|reissue|re-edition|heritage|archive|revival|relaunch|\bretro\b|\b19[2-8]0s\b/i],
  ["Affordable & micro", /affordable|micro ?brand|micro mondays|under \$\d|budget/i],
  ["Auctions & market", /auction|phillips|christie|sotheby|antiquorum|pre-owned|secondary market/i],
  ["Industry & business", /\bstake\b|acqui|merger|results|revenue|organic growth|\bceo\b|industry|exports|financial|quarter|\blvmh\b|richemont|swatch group/i],
  ["Events & fairs", /\bfair\b|exhibition|watches (?:&|and) wonders|watch days|watch week|watchtime new york|windup/i],
];

const KINDS = [
  ["Podcast", /podcast/i],
  ["Video", /\bvideo\b|\| .*ep\.? ?\d/i],
  ["Roundup", /last week in watches|round-?up|new releases from|\b\d+ (?:of )?(?:the )?best\b|\bbest .* watches\b/i],
  ["Hands-on", /hands[- ]on|in the metal/i],
  ["Review", /review|wrist time|long-term|tested/i],
  ["Interview", /interview|in conversation|^portrait|talks? (?:to|with)|\bq ?& ?a\b|the long view|freaking out with/i],
  ["Opinion", /opinion|column|editorial|according to|collector'?s view|\bwhy i\b|\?\s*$/i],
  ["New release", /introduc|new release|first look|unveil|launch|debut|\bnew\b|presents|releases|\badds\b|\bgives\b|returns|is back|reissue|\bmeet\b|upgrade|\bgets\b/i],
];

const STOP = new Set(("a an and the of for to in on at by with from its it is are be as this that their our your his her we you new introducing " +
  "introduces hands review first look watch watches edition editions limited model models release releases launches launch unveils unveil debut " +
  "ref reference collection series version latest takes take gives give makes make brings bring back more now even just into over after than " +
  "what why how who all one two three out up gets get has have more most best update updates updated meet inside trying try out ready action " +
  "piece pieces mm year years anniversary special via amp last week both side sides plays play").split(" "));
// Common model families: shared alone they do not make two articles the same story.
const GENERIC = new Set(("speedmaster seamaster submariner daytona navitimer santos tank royal oak nautilus aquanaut calatrava pelagos black bay " +
  "luminor carrera monaco reverso overseas portugieser pilot pilots constellation aqua terra datejust explorer gmt master promaster prospex " +
  "chronograph chrono diver dive smartwatch smartwatches tourbillon perpetual calendar dial dials gold steel titanium ceramic blue green black " +
  "white automatic world time field dress sport sports watchmaking watchmaker podcast video episode part").split(" "));

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const strip = (html) => String(html || "")
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#8217;|&rsquo;/g, "'")
  .replace(/&#8216;|&lsquo;/g, "'").replace(/&#822[01];|&[lr]dquo;/g, '"').replace(/&#8211;|&ndash;/g, "–").replace(/&#8212;|&mdash;/g, "—")
  .replace(/&#8230;|&hellip;/g, "…").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/\s+/g, " ").trim();

function teaserOf(item) {
  let t = strip(item.contentSnippet || item.summary || item.description || item.content || "");
  t = t.replace(/The post .* appeared first on .*$/i, "").replace(/\s*(Read more|Continue reading|\[…\]|\[\.\.\.\]).*$/i, "").trim();
  if (!t) return "";
  const sentences = t.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [t];
  let out = "";
  for (const s of sentences) { if ((out + s).length > 260) break; out += s; if (out.length > 140) break; }
  if (!out) out = t.slice(0, 240).replace(/\s+\S*$/, "") + "…";
  return out.trim();
}

function cleanUrl(u) {
  try {
    const url = new URL(u);
    [...url.searchParams.keys()].forEach((k) => { if (/^utm_|^fbclid$|^ref$/.test(k)) url.searchParams.delete(k); });
    url.hash = "";
    return url.toString();
  } catch { return u; }
}

function idFor(source, url) {
  let path = url.replace(/[?#].*$/, "").replace(/\/+$/, "");
  let last = path.split("/").pop().replace(/\.html?$/, "").toLowerCase();
  last = last.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return (source + "-" + last).slice(0, 150);
}

const isImg = (u) => /\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(u || "");
const badImg = (u) => /gravatar|feeds\.feedburner|pixel|spacer|1x1|blank\.gif|emoji|wp-includes\/images|substackcdn\.com\/image\/fetch\/.*\/https%3A%2F%2Fsubstack-post-media\.s3\.amazonaws\.com%2Fpublic%2Fimages%2F[^/]*_\d{1,2}x\d{1,2}/i.test(u || "");

function absolute(u, base) { try { return new URL(u, base).toString(); } catch { return null; } }

function imageFromItem(item) {
  const cands = [];
  const enc = item.enclosure;
  if (enc?.url && (/^image\//.test(enc.type || "") || isImg(enc.url))) cands.push(enc.url);
  for (const m of [].concat(item.mediaContent || [], item.mediaThumbnail || [])) {
    const a = m?.$ || {};
    if (a.url && (a.medium === "image" || /^image\//.test(a.type || "") || isImg(a.url))) cands.push([a.url, +a.width || 0]);
  }
  const html = [item.contentEncoded, item["content:encoded"], item.content, item.summary, item.description].filter(Boolean).join(" ");
  const re = /<img[^>]+?(?:data-src|src)=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) cands.push(m[1]);
  const flat = cands.map((c) => (Array.isArray(c) ? c : [c, 0])).filter(([u]) => u && !badImg(u));
  flat.sort((a, b) => b[1] - a[1]);
  return flat.length ? absolute(flat[0][0], item.link) : null;
}

async function fetchText(url, ms = 15000, maxBytes = 600000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*;q=0.8" }, redirect: "follow", signal: ctl.signal });
    if (!res.ok) return null;
    const reader = res.body.getReader();
    let got = 0, chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      if (got > maxBytes || /<\/head>/i.test(Buffer.from(value).toString("utf8"))) { ctl.abort(); break; }
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch { return null; } finally { clearTimeout(timer); }
}

async function ogImage(url) {
  const html = await fetchText(url);
  if (!html) return null;
  const metas = html.match(/<meta[^>]+>/gi) || [];
  for (const want of ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) {
    for (const tag of metas) {
      const key = (tag.match(/(?:property|name)=["']([^"']+)["']/i) || [])[1];
      if (key && key.toLowerCase() === want) {
        const c = (tag.match(/content=["']([^"']+)["']/i) || [])[1];
        if (c && !badImg(c)) return absolute(c.replace(/&amp;/g, "&"), url);
      }
    }
  }
  return null;
}

function brandsOf(text) {
  const out = [];
  for (const [name, re] of BRANDS) if (re.test(text) && !out.includes(name)) out.push(name);
  return out.slice(0, 6);
}
function topicsOf(text, brands) {
  const out = [];
  for (const [name, re] of TOPICS) if (re.test(text)) out.push(name);
  if (brands.some((b) => INDEPENDENTS.has(b)) && !out.includes("Independents")) out.unshift("Independents");
  if (brands.some((b) => MICRO.has(b)) && !out.includes("Affordable & micro")) out.push("Affordable & micro");
  return [...new Set(out)].slice(0, 3);
}
function kindOf(title, cats, forced) {
  if (forced) return forced;
  const s = title + " | " + cats;
  for (const [k, re] of KINDS) if (re.test(k === "Opinion" ? title : s)) return k;
  return "News";
}

/* ---------- story grouping ---------- */
function tokens(a) {
  const slug = (a.url || "").replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop().replace(/\.html?$/, "").replace(/-/g, " ");
  let s = (a.title + " " + slug).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/([a-z])[\/-](\d)/g, "$1$2").replace(/(\d)[\/-]([a-z])/g, "$1$2");
  const brandWords = new Set((a.brands || []).join(" ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/));
  const out = new Set();
  for (let w of s.split(/[^a-z0-9]+/)) {
    if (!w || STOP.has(w) || brandWords.has(w)) continue;
    if (w.length > 4 && w.endsWith("s") && !/\d/.test(w)) w = w.slice(0, -1);
    if (w.length < 2 && !/\d/.test(w)) continue;
    if (/^\d$/.test(w)) continue;
    out.add(w);
  }
  return out;
}
function sameStory(a, b) {
  if (Math.abs(Date.parse(a.published) - Date.parse(b.published)) > 5 * DAY) return false;
  // Round-ups and multi-brand lists cover many watches; never group them.
  if (a.kind === "Roundup" || b.kind === "Roundup" || (a.brands || []).length > 3 || (b.brands || []).length > 3) return false;
  const ba = new Set(a.brands || []), bb = b.brands || [];
  const brandShared = bb.some((x) => ba.has(x));
  if ((ba.size || bb.length) && !brandShared) return false;
  const ta = a._tok || (a._tok = tokens(a)), tb = b._tok || (b._tok = tokens(b));
  const strong = [...ta].filter((w) => tb.has(w) && isStrong(w));
  // Same brand: one distinctive shared word (a model name or reference) is enough.
  // No brand on either side: needs three.
  return brandShared ? strong.length >= 1 : strong.length >= 3;
}
const isStrong = (w) => !GENERIC.has(w) && !/^(19|20)\d\d$/.test(w) && !/^\d{1,2}$/.test(w) && (w.length >= 4 || /\d/.test(w));
function assignStories(items) {
  const parent = new Map(items.map((a) => [a.id, a.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (x, y) => { const rx = find(x), ry = find(y); if (rx !== ry) parent.set(rx, ry); };
  // existing story keys stay together
  const byStory = new Map();
  for (const a of items) if (a.story) { if (byStory.has(a.story)) union(a.id, byStory.get(a.story)); else byStory.set(a.story, a.id); }
  const recent = items.filter((a) => NOW - Date.parse(a.published) < 10 * DAY);
  for (let i = 0; i < recent.length; i++) for (let j = i + 1; j < recent.length; j++) {
    const a = recent[i], b = recent[j];
    if (a.source === b.source) continue;
    if (sameStory(a, b)) union(a.id, b.id);
  }
  const groups = new Map();
  for (const a of items) { const r = find(a.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(a); }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const existing = g.map((a) => a.story).find(Boolean);
    let key = existing;
    if (!key) {
      const common = [...g[0]._tok || tokens(g[0])].filter((w) => g.every((a) => (a._tok || tokens(a)).has(w)) && !GENERIC.has(w)).slice(0, 3);
      key = [...(g[0].brands || []).slice(0, 1), ...common].join(" ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || g[0].id.slice(0, 60);
    }
    for (const a of g) a.story = key;
  }
  for (const a of items) delete a._tok;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

export { brandsOf, topicsOf, kindOf, assignStories, tokens, sameStory, imageFromItem, teaserOf, idFor };

async function main() {
  const cfg = JSON.parse(await readFile(FEEDS_FILE, "utf8"));
  let prev = { items: [] };
  try { prev = JSON.parse(await readFile(OUT_FILE, "utf8")); } catch {}
  const byId = new Map((prev.items || []).map((a) => [a.id, a]));
  const knownUrls = new Set((prev.items || []).map((a) => a.url));

  const parser = new Parser({
    timeout: 20000,
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5" },
    customFields: { item: [["media:content", "mediaContent", { keepArray: true }], ["media:thumbnail", "mediaThumbnail", { keepArray: true }], ["content:encoded", "contentEncoded"], ["dc:creator", "creator"]] },
  });

  const status = {};
  const fresh = [];
  await Promise.all(cfg.sources.map(async (src) => {
    status[src.key] = { ok: true, added: 0 };
    const skip = src.skip || {};
    const re = (s) => (s ? new RegExp(s, "i") : null);
    const skipTitle = re(skip.title), skipCats = re(skip.categories), skipUrl = re(skip.url);
    for (const feedUrl of src.feeds) {
      let feed;
      try { feed = await parser.parseURL(feedUrl); }
      catch (e) { status[src.key] = { ok: false, added: status[src.key].added, error: String(e.message || e).slice(0, 140) }; continue; }
      const forcedKind = /videos?\.atom|\/videos?\b/.test(feedUrl) ? "Video" : null;
      for (const item of feed.items || []) {
        const link = item.link || item.guid;
        if (!item.title || !link || !/^https?:/.test(link)) continue;
        const url = cleanUrl(link);
        const published = item.isoDate || (item.pubDate && new Date(item.pubDate).toISOString()) || null;
        if (!published || NOW - Date.parse(published) > NEW_WINDOW_DAYS * DAY || Date.parse(published) - NOW > DAY) continue;
        const id = idFor(src.key, url);
        if (byId.has(id) || knownUrls.has(url)) continue;
        const cats = (item.categories || []).map((c) => (typeof c === "string" ? c : c?._ || c?.$?.term || "")).join(", ");
        const author = String(item.creator || item.author || (typeof item["dc:creator"] === "string" ? item["dc:creator"] : "") || "").replace(/^TB Team$/i, src.name).trim();
        const title = strip(item.title);
        if (/SponsoredPost|Industry News Feed/i.test(author) || /sponsor/i.test(cats) || /\bsponsored\b/i.test(title)) continue;
        if ((skipTitle && skipTitle.test(title)) || (skipCats && skipCats.test(cats)) || (skipUrl && skipUrl.test(url))) continue;
        const slug = url.split("/").filter(Boolean).pop() || "";
        const text = title + " " + slug.replace(/-/g, " ") + " " + cats;
        const brands = brandsOf(text);
        const teaser = teaserOf(item);
        fresh.push({
          id, title, url, source: src.key, author: author || src.name, published: new Date(published).toISOString(),
          added: new Date(NOW).toISOString(), kind: kindOf(title, cats, forcedKind), brands,
          topics: topicsOf(text + " " + teaser, brands), story: "", teaser, image: imageFromItem(item),
        });
        knownUrls.add(url);
        status[src.key].added++;
      }
    }
  }));

  // Merge, prune, group.
  let items = [...fresh, ...(prev.items || [])]
    .filter((a) => NOW - Date.parse(a.published) < KEEP_DAYS * DAY)
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
    .slice(0, MAX_ITEMS);
  assignStories(items);

  // Fill in missing cover images from the article page, newest first, a few at a time.
  const needs = items.filter((a) => !a.image && !a.noImage).slice(0, IMAGE_LOOKUPS);
  for (let i = 0; i < needs.length; i += 6) {
    await Promise.all(needs.slice(i, i + 6).map(async (a) => {
      const img = await ogImage(a.url);
      if (img) a.image = img; else a.noImage = true;
    }));
  }

  const sources = Object.fromEntries(cfg.sources.map((s) => [s.key, { name: s.name, site: s.site, hue: s.hue }]));
  const out = { generated: new Date(NOW).toISOString(), added: fresh.length, status, sources, items };
  await writeFile(OUT_FILE, JSON.stringify(out, null, 0) + "\n");
  const failed = Object.entries(status).filter(([, s]) => !s.ok).map(([k, s]) => k + " (" + s.error + ")");
  console.log(`Added ${fresh.length} stories. ${items.length} in the app. Images looked up: ${needs.length}.` + (failed.length ? ` Failed: ${failed.join("; ")}` : ""));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
