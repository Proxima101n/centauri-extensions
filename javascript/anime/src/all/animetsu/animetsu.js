const BASE_URL = "https://animetsu-mangayomi-extension.onrender.com";

async function apiGet(path) {
  const client = new Client();
  const res = await client.get(`${BASE_URL}${path}`);
  const data = JSON.parse(res.body);
  if (!data.success) throw new Error(data.error?.message || "API error");
  return data.data;
}

class DefaultExtension extends MProvider {
  getPreference(key) {
    return new SharedPreferences().get(key);
  }

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

    let servers = this.getPreference("animetsu_servers");
    let audioTypes = this.getPreference("animetsu_audio");
    const qualityPref = this.getPreference("animetsu_quality");

    if (!servers || servers.length === 0) servers = ["auto"];
    if (!audioTypes || audioTypes.length === 0) audioTypes = ["sub"];

    const allStreams = [];

    for (const server of servers) {
      for (const audioType of audioTypes) {
        try {
          const data = await apiGet(
            `/api/anime/${id}/watch/${ep}?server=${server}&source_type=${audioType}`
          );
          const sources = Array.isArray(data.sources) ? data.sources : [];
          const subtitles = Array.isArray(data.subtitles)
            ? data.subtitles.map((s) => ({ file: s.url, label: s.label || s.lang }))
            : [];

          sources.forEach((s, i) => {
            allStreams.push({
              url: s.proxy_url || s.url,
              originalUrl: s.url,
              quality: `${s.quality || "Auto"} - ${data.server?.toUpperCase() || server.toUpperCase()} - ${audioType.toUpperCase()}`,
              subtitles: i === 0 ? subtitles : [],
            });
          });
        } catch {
          // server/audio combo not available, skip
        }
      }
    }

    // sort preferred quality to top
    if (qualityPref && qualityPref !== "auto") {
      allStreams.sort((a, b) => {
        const aMatch = a.quality.toLowerCase().includes(qualityPref) ? -1 : 1;
        const bMatch = b.quality.toLowerCase().includes(qualityPref) ? -1 : 1;
        return aMatch - bMatch;
      });
    }

    return allStreams;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [
      {
        key: "animetsu_servers",
        multiSelectListPreference: {
          title: "Preferred servers",
          summary: "Choose which servers to fetch streams from",
          values: ["auto"],
          entries: ["Auto", "Pahe", "Kite", "Meg", "Dio", "Kiss"],
          entryValues: ["auto", "pahe", "kite", "meg", "dio", "kiss"],
        },
      },
      {
        key: "animetsu_audio",
        multiSelectListPreference: {
          title: "Sub / Dub",
          summary: "Choose sub, dub, or both",
          values: ["sub"],
          entries: ["Sub", "Dub"],
          entryValues: ["sub", "dub"],
        },
      },
      {
        key: "animetsu_quality",
        listPreference: {
          title: "Preferred quality",
          summary: "Stream quality to prioritize",
          valueIndex: 0,
          entries: ["Auto", "1080p", "720p", "480p", "360p"],
          entryValues: ["auto", "1080", "720", "480", "360"],
        },
      },
    ];
  }
}

const source = new DefaultExtension();