const BASE_URL = "https://animetsu-mangayomi-extension.onrender.com";

async function apiGet(path) {
  const client = new Client();
  const res = await client.get(`${BASE_URL}${path}`);
  const data = JSON.parse(res.body);
  if (!data.success) throw new Error(data.error?.message || "API error");
  return data.data;
}

class DefaultExtension extends MProvider {
  async searchAnime({ query = "", sort = "popularity", status = "", page = 1 }) {
    let slug = `/api/search?sort=${sort}&page=${page}&per_page=20`;
    if (query.length > 0) slug += `&q=${encodeURIComponent(query)}`;
    if (status.length > 0) slug += `&status=${status}`;

    const data = await apiGet(slug);
    const results = Array.isArray(data) ? data : data.results || [];
    const hasNextPage = results.length === 20;

    const list = results.map((a) => ({
      name: a.title?.english || a.title?.romaji || "",
      link: String(a.id),
      imageUrl: a.cover_image?.medium || a.cover_image?.large || "",
    }));

    return { list, hasNextPage };
  }

  async getPopular(page) {
    return await this.searchAnime({ page });
  }

  async getLatestUpdates(page) {
    return await this.searchAnime({ sort: "date_desc", status: "RELEASING", page });
  }

  async search(query, page, filters) {
    return await this.searchAnime({ query, page });
  }

  async getDetail(url) {
    const id = url;

    const [anime, epData] = await Promise.all([
      apiGet(`/api/anime/${id}`),
      apiGet(`/api/anime/${id}/episodes`),
    ]);

    const statusMap = {
      RELEASING: 0,
      FINISHED: 1,
      HIATUS: 2,
      CANCELLED: 3,
      NOT_YET_RELEASED: 4,
    };

    const chapters = (Array.isArray(epData) ? epData : []).map((ep) => ({
      name: anime.format === "MOVIE" ? ep.name : `E${ep.ep_num} : ${ep.name}`,
      url: `${id}/${ep.ep_num}`,
      dateUpload: ep.aired_at ? new Date(ep.aired_at).valueOf().toString() : null,
      thumbnailUrl: ep.img || null,
      description: ep.desc || null,
    })).reverse();

    return {
      name: anime.title?.english || anime.title?.romaji || "",
      imageUrl: anime.cover_image?.medium || anime.cover_image?.large || "",
      description: anime.description || "",
      genre: anime.genres || [],
      status: statusMap[anime.status] ?? 5,
      chapters,
    };
  }

  async getVideoList(url) {
    const [id, ep] = url.split("/");
    let data;
    try {
      data = await apiGet(
        `/api/anime/${id}/watch/${ep}?server=auto&source_type=sub&fallback=true`
      );
    } catch {
      data = await apiGet(
        `/api/anime/${id}/watch/${ep}?server=auto&source_type=dub&fallback=true`
      );
    }

    const sources = Array.isArray(data.sources) ? data.sources : [];
    const subtitles = Array.isArray(data.subtitles)
      ? data.subtitles.map((s) => ({
          file: s.url,
          label: s.label || s.lang,
        }))
      : [];

    return sources.map((s, i) => ({
      url: s.proxy_url || s.url,
      originalUrl: s.url,
      quality: `${s.quality || "Auto"} - ${data.server?.toUpperCase() || "AUTO"} - ${data.source_type?.toUpperCase() || "SUB"}`,
      subtitles: i === 0 ? subtitles : [],
    }));
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [];
  }
}

const source = new DefaultExtension();
