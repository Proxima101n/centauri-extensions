const BASE_URL = "https://animetsu-mangayomi-extension.onrender.com";

async function apiGet(path) {
  const client = new Client();
  const res = await client.get(`${BASE_URL}${path}`);
  const data = JSON.parse(res.body);
  if (!data.success) throw new Error(data.error?.message || "API error");
  return data.data;
}

function mapAnime(a) {
  return {
    name: a.title?.english || a.title?.romaji || a.title || "",
    url: String(a.id),
    imageUrl: a.cover_image?.large || a.coverImage?.large || a.image || "",
  };
}

class DefaultExtension extends MProvider {
  async getPopular(page) {
    const data = await apiGet(`/api/popular`);
    const items = Array.isArray(data) ? data : data.results || data.media || [];
    return { list: items.map(mapAnime), hasNextPage: false };
  }

  async getLatest(page) {
    const data = await apiGet(`/api/recent?page=${page}&per_page=20`);
    const items = Array.isArray(data) ? data : data.results || data.media || [];
    return { list: items.map(mapAnime), hasNextPage: items.length === 20 };
  }

  async search(query, page, filters) {
    const data = await apiGet(
      `/api/search?q=${encodeURIComponent(query)}&page=${page}`
    );
    const items = Array.isArray(data) ? data : data.results || data.media || [];
    return { list: items.map(mapAnime), hasNextPage: items.length >= 20 };
  }

  async getDetail(url) {
    const id = url;
    const [anime, episodesData] = await Promise.all([
      apiGet(`/api/anime/${id}`),
      apiGet(`/api/anime/${id}/episodes`),
    ]);

    const episodes = (Array.isArray(episodesData) ? episodesData : episodesData.results || []).map(
      (ep) => ({
        name: ep.title ? `Ep ${ep.number}: ${ep.title}` : `Episode ${ep.number}`,
        url: `${id}||${ep.number}`,
        dateUpload: ep.airDate ? new Date(ep.airDate).getTime().toString() : null,
      })
    );

    const statusMap = {
      RELEASING: 0,
      FINISHED: 1,
      HIATUS: 2,
      CANCELLED: 3,
      NOT_YET_RELEASED: 5,
    };

    return {
      name: anime.title?.english || anime.title?.romaji || "",
      imageUrl: anime.cover_image?.large || anime.coverImage?.large || anime.image || "",
      description: anime.description || "",
      genre: anime.genres || [],
      status: statusMap[anime.status] ?? 5,
      episodes,
    };
  }

  async getVideoList(url) {
    const [id, ep] = url.split("||");
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
    return sources.map((s) => ({
      url: s.proxy_url || s.url,
      originalUrl: s.url,
      quality: s.quality || "default",
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
