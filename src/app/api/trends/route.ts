import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import * as cheerio from "cheerio";

interface TrendItem {
  title: string;
  source: string;
}

async function fetchGoogleTrendsBR(): Promise<TrendItem[]> {
  try {
    const res = await fetch(
      "https://trends.google.com.br/trending/rss?geo=BR",
      { next: { revalidate: 300 } }
    );
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const items: TrendItem[] = [];

    $("item").each((_, el) => {
      const title = $(el).find("title").text().trim();
      if (title) {
        items.push({ title, source: "Google Trends BR" });
      }
    });

    return items.slice(0, 10);
  } catch (err) {
    console.error("[trends] Google Trends error:", err);
    return [];
  }
}

async function fetchNewsHeadlines(): Promise<TrendItem[]> {
  try {
    // G1 RSS feed
    const res = await fetch(
      "https://g1.globo.com/rss/g1/",
      { next: { revalidate: 300 } }
    );
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const items: TrendItem[] = [];

    $("item").each((_, el) => {
      const title = $(el).find("title").text().trim();
      if (title) {
        items.push({ title, source: "G1" });
      }
    });

    return items.slice(0, 10);
  } catch (err) {
    console.error("[trends] News error:", err);
    return [];
  }
}

async function fetchTechTrends(): Promise<TrendItem[]> {
  try {
    const res = await fetch(
      "https://news.google.com/rss/search?q=tecnologia+negócios+brasil&hl=pt-BR&gl=BR&ceid=BR:pt-419",
      { next: { revalidate: 300 } }
    );
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const items: TrendItem[] = [];

    $("item").each((_, el) => {
      const title = $(el).find("title").text().trim();
      if (title) {
        items.push({ title, source: "Google News Tech" });
      }
    });

    return items.slice(0, 10);
  } catch (err) {
    console.error("[trends] Tech trends error:", err);
    return [];
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const [googleTrends, news, tech] = await Promise.all([
    fetchGoogleTrendsBR(),
    fetchNewsHeadlines(),
    fetchTechTrends(),
  ]);

  return NextResponse.json({
    trends: googleTrends,
    news: news,
    tech: tech,
    fetchedAt: new Date().toISOString(),
  });
}
