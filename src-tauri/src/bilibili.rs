//! Bilibili "选集" (collection) probing over the public web APIs.
//!
//! A pasted URL can turn out to be one of four things:
//! - a video whose own pages (分P) form the episode list (`multi_p`),
//! - a video belonging to a `ugc_season` collection (`list`),
//! - a space collection/series page (`space.bilibili.com/.../collectiondetail|seriesdetail`),
//! - or a plain single video (`single`).
//!
//! All endpoints below answer without login when called with browser-like
//! `User-Agent`/`Referer` headers; episodes are imported later through the
//! normal yt-dlp pipeline, one URL per episode.

use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const WWW_REFERER: &str = "https://www.bilibili.com/";
const SPACE_REFERER: &str = "https://space.bilibili.com/";

/// One selectable episode of a multi-P video or collection.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionEpisode {
    /// 1-based position within this probe (equals `page` for multi-P).
    pub index: u32,
    /// BV id of the episode (the parent video's BV for multi-P pages).
    pub bvid: String,
    /// 1-based page number; only present for multi-P episodes.
    pub page: Option<u32>,
    pub title: String,
    /// Duration in seconds (0 when the API does not provide one).
    pub duration: f64,
}

/// Result of probing a URL for collection info.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionProbe {
    /// `"single"`, `"multi_p"` (the video itself has >1 pages) or `"list"`
    /// (ugc_season collection, space collection or space series).
    pub kind: &'static str,
    pub title: String,
    pub episodes: Vec<CollectionEpisode>,
}

/// BV or av reference found in a video URL.
#[derive(Debug, PartialEq)]
enum VideoRef {
    Bvid(String),
    Aid(String),
}

/// A space collection (`collectiondetail`) or series (`seriesdetail`) page.
#[derive(Debug, PartialEq)]
struct SpaceList {
    mid: String,
    sid: String,
    series: bool,
}

/// What the `x/web-interface/view` response means for the probe.
enum ViewOutcome {
    MultiP(CollectionProbe),
    List {
        mid: String,
        season_id: String,
        /// Episodes embedded in the view response; used when the paginated
        /// season API is unavailable.
        embedded: CollectionProbe,
    },
    Single(CollectionProbe),
}

/// Probe a pasted URL for collection info. Fails with a user-facing message;
/// callers degrade to a plain single-video import in that case.
pub async fn probe(url: &str) -> Result<CollectionProbe, String> {
    let client = http_client();
    let url = resolve_short_link(client, url.trim()).await?;

    // A link that already points at one page (?p=N) imports that page;
    // respect the user's selection and skip the collection flow.
    if query_param(&url, "p").is_some() {
        return Ok(CollectionProbe {
            kind: "single",
            title: String::new(),
            episodes: Vec::new(),
        });
    }

    if let Some(space) = parse_space_list(&url) {
        return probe_space_list(client, &space).await;
    }

    let video_ref = extract_video_ref(&url).ok_or_else(|| "无法识别的 B 站视频链接".to_string())?;
    let data = view_data(client, &video_ref).await?;

    match classify_view(&data) {
        ViewOutcome::MultiP(probe) => Ok(probe),
        ViewOutcome::Single(probe) => Ok(probe),
        ViewOutcome::List {
            mid,
            season_id,
            embedded,
        } => {
            if !mid.is_empty() && !season_id.is_empty() {
                if let Ok((title, episodes)) = season_archives(client, &mid, &season_id).await {
                    if !episodes.is_empty() {
                        return Ok(CollectionProbe {
                            kind: "list",
                            title: if title.is_empty() {
                                embedded.title
                            } else {
                                title
                            },
                            episodes,
                        });
                    }
                }
            }
            Ok(embedded)
        }
    }
}

async fn probe_space_list(
    client: &reqwest::Client,
    space: &SpaceList,
) -> Result<CollectionProbe, String> {
    let (title, episodes) = if space.series {
        series_archives(client, &space.mid, &space.sid).await?
    } else {
        season_archives(client, &space.mid, &space.sid).await?
    };
    if episodes.is_empty() {
        return Err("该合集为空或无法读取".to_string());
    }
    let fallback = if space.series {
        format!("空间系列 {}", space.sid)
    } else {
        format!("空间合集 {}", space.sid)
    };
    Ok(CollectionProbe {
        kind: "list",
        title: if title.is_empty() { fallback } else { title },
        episodes,
    })
}

/// Split a scheme-relative URL into lowercased-insensitive host and the
/// path/query tail (no leading slash).
fn split_scheme(url: &str) -> Option<(String, &str)> {
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))?;
    Some(match rest.split_once('/') {
        Some((host, tail)) => (host.to_ascii_lowercase(), tail),
        None => (rest.to_ascii_lowercase(), ""),
    })
}

fn query_param(url: &str, key: &str) -> Option<String> {
    let tail = split_scheme(url)?.1;
    let query = tail.split_once('?')?.1;
    let query = query.split('#').next().unwrap_or("");
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == key).then(|| v.to_string())
    })
}

/// BV/av reference from a `www.bilibili.com/video/...` URL. Query strings
/// (`?p=2`, spm tracking, ...) are ignored.
fn extract_video_ref(url: &str) -> Option<VideoRef> {
    let (host, tail) = split_scheme(url)?;
    if host == "space.bilibili.com" || !(host == "bilibili.com" || host.ends_with(".bilibili.com"))
    {
        return None;
    }
    let path = tail.split(['?', '#']).next().unwrap_or("");
    let seg = path.strip_prefix("video/")?;
    let seg = seg.split('/').next()?;
    if let Some(aid) = seg.strip_prefix("av") {
        return (!aid.is_empty() && aid.bytes().all(|b| b.is_ascii_digit()))
            .then_some(VideoRef::Aid(aid.to_string()));
    }
    if is_bvid(seg) {
        return Some(VideoRef::Bvid(seg.to_string()));
    }
    None
}

/// BV ids are `BV` + 10 alphanumeric characters.
fn is_bvid(seg: &str) -> bool {
    seg.len() == 12 && seg.starts_with("BV") && seg[2..].bytes().all(|b| b.is_ascii_alphanumeric())
}

fn parse_space_list(url: &str) -> Option<SpaceList> {
    let (host, tail) = split_scheme(url)?;
    if host != "space.bilibili.com" {
        return None;
    }
    let path = tail.split(['?', '#']).next().unwrap_or("");
    let mut segs = path.split('/').filter(|s| !s.is_empty());
    let mid = segs.next()?;
    if !mid.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    if segs.next()? != "channel" {
        return None;
    }
    let series = match segs.next()? {
        "collectiondetail" => false,
        "seriesdetail" => true,
        _ => return None,
    };
    let sid = query_param(url, "sid")?;
    if sid.is_empty() || !sid.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    Some(SpaceList {
        mid: mid.to_string(),
        sid,
        series,
    })
}

/// b23.tv short links redirect to the real page; reqwest follows the chain so
/// the final response URL can be parsed like a pasted one.
async fn resolve_short_link(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let is_short = matches!(split_scheme(url), Some((host, _)) if host == "b23.tv");
    if !is_short {
        return Ok(url.to_string());
    }
    let resp = client
        .get(url)
        .header("Referer", WWW_REFERER)
        .send()
        .await
        .map_err(|e| format!("无法解析短链接: {e}"))?;
    Ok(resp.url().to_string())
}

async fn view_data(client: &reqwest::Client, video_ref: &VideoRef) -> Result<Value, String> {
    let (param, value) = match video_ref {
        VideoRef::Bvid(bvid) => ("bvid", bvid),
        VideoRef::Aid(aid) => ("aid", aid),
    };
    let url = format!("https://api.bilibili.com/x/web-interface/view?{param}={value}");
    let json = get_json(client, &url, WWW_REFERER).await?;
    api_data(json, "view")
}

/// All archives of a season (ugc_season or space 合集), paginated at 100 per
/// page. Returns the list title from `meta.name` and the flattened episodes.
async fn season_archives(
    client: &reqwest::Client,
    mid: &str,
    season_id: &str,
) -> Result<(String, Vec<CollectionEpisode>), String> {
    let mut title = String::new();
    let mut episodes: Vec<CollectionEpisode> = Vec::new();
    let mut page_num: u32 = 1;
    loop {
        let url = format!(
            "https://api.bilibili.com/x/polymer/web-space/seasons_archives_list?mid={mid}&season_id={season_id}&page_num={page_num}&page_size=100"
        );
        let data = api_data(
            get_json(client, &url, SPACE_REFERER).await?,
            "seasons_archives_list",
        )?;
        if title.is_empty() {
            title = data
                .pointer("/meta/name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
        }
        let archives = data
            .get("archives")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let fetched = archives.len();
        append_archives(&mut episodes, &archives);
        // 100 pages x 100 items is a hard stop well past any real collection.
        if fetched < 100 || page_num >= 100 {
            break;
        }
        page_num += 1;
    }
    Ok((title, episodes))
}

/// All archives of a space series, paginated at 30 per page (the server's
/// documented page size for this endpoint). Returns the series title.
async fn series_archives(
    client: &reqwest::Client,
    mid: &str,
    series_id: &str,
) -> Result<(String, Vec<CollectionEpisode>), String> {
    // The series title lives in a separate endpoint; losing it is not fatal.
    let title = {
        let url = format!("https://api.bilibili.com/x/series/series?series_id={series_id}");
        get_json(client, &url, SPACE_REFERER)
            .await
            .ok()
            .and_then(|json| {
                json.pointer("/data/meta/name")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .unwrap_or_default()
    };
    let mut episodes: Vec<CollectionEpisode> = Vec::new();
    let mut pn: u32 = 1;
    loop {
        let url = format!(
            "https://api.bilibili.com/x/series/archives?mid={mid}&series_id={series_id}&pn={pn}&ps=30"
        );
        let data = api_data(
            get_json(client, &url, SPACE_REFERER).await?,
            "series_archives",
        )?;
        let archives = data
            .get("archives")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let fetched = archives.len();
        append_archives(&mut episodes, &archives);
        if fetched < 30 || pn >= 200 {
            break;
        }
        pn += 1;
    }
    Ok((title, episodes))
}

fn classify_view(data: &Value) -> ViewOutcome {
    let title = str_field(data, "title");
    let bvid = str_field(data, "bvid");
    let pages = data
        .get("pages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    if pages.len() > 1 && !bvid.is_empty() {
        return ViewOutcome::MultiP(CollectionProbe {
            kind: "multi_p",
            title,
            episodes: episodes_from_pages(&bvid, &pages),
        });
    }

    if let Some(season) = data.get("ugc_season") {
        let embedded_episodes = episodes_from_season(season);
        if !embedded_episodes.is_empty() {
            let embedded = CollectionProbe {
                kind: "list",
                title: season
                    .get("title")
                    .and_then(Value::as_str)
                    .filter(|t| !t.is_empty())
                    .unwrap_or(&title)
                    .to_string(),
                episodes: embedded_episodes,
            };
            return ViewOutcome::List {
                mid: id_string(season, "mid"),
                season_id: id_string(season, "id"),
                embedded,
            };
        }
    }

    ViewOutcome::Single(CollectionProbe {
        kind: "single",
        title,
        episodes: Vec::new(),
    })
}

fn episodes_from_pages(bvid: &str, pages: &[Value]) -> Vec<CollectionEpisode> {
    pages
        .iter()
        .filter_map(|page| {
            let page_num = page.get("page").and_then(Value::as_u64)? as u32;
            let part = page.get("part").and_then(Value::as_str).unwrap_or("");
            let title = if part.is_empty() {
                format!("p{page_num:02}")
            } else {
                format!("p{page_num:02} {part}")
            };
            Some(CollectionEpisode {
                index: page_num,
                bvid: bvid.to_string(),
                page: Some(page_num),
                title,
                duration: page.get("duration").and_then(Value::as_f64).unwrap_or(0.0),
            })
        })
        .collect()
}

/// Episodes embedded in the view response's `ugc_season`; the per-episode
/// duration lives inside `arc`.
fn episodes_from_season(season: &Value) -> Vec<CollectionEpisode> {
    let mut out = Vec::new();
    let sections = season
        .get("sections")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for section in &sections {
        let episodes = section
            .get("episodes")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for ep in &episodes {
            let Some(bvid) = ep.get("bvid").and_then(Value::as_str) else {
                continue;
            };
            out.push(CollectionEpisode {
                index: out.len() as u32 + 1,
                bvid: bvid.to_string(),
                page: None,
                title: ep
                    .get("title")
                    .and_then(Value::as_str)
                    .filter(|t| !t.is_empty())
                    .unwrap_or(bvid)
                    .to_string(),
                duration: ep
                    .pointer("/arc/duration")
                    .or_else(|| ep.get("duration"))
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0),
            });
        }
    }
    out
}

/// Map one page of `archives` items (shared by the season and series APIs)
/// onto the running episode list.
fn append_archives(out: &mut Vec<CollectionEpisode>, archives: &[Value]) {
    for arc in archives {
        let Some(bvid) = arc.get("bvid").and_then(Value::as_str) else {
            continue;
        };
        out.push(CollectionEpisode {
            index: out.len() as u32 + 1,
            bvid: bvid.to_string(),
            page: None,
            title: arc
                .get("title")
                .and_then(Value::as_str)
                .filter(|t| !t.is_empty())
                .unwrap_or(bvid)
                .to_string(),
            duration: arc.get("duration").and_then(Value::as_f64).unwrap_or(0.0),
        });
    }
}

async fn get_json(client: &reqwest::Client, url: &str, referer: &str) -> Result<Value, String> {
    let resp = client
        .get(url)
        .header("Referer", referer)
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("B站接口返回 HTTP {}", resp.status()));
    }
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取 B 站接口响应失败: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("解析 B 站接口响应失败: {e}"))
}

fn api_data(json: Value, api: &str) -> Result<Value, String> {
    let code = json.get("code").and_then(Value::as_i64).unwrap_or(-1);
    if code != 0 {
        let message = json.get("message").and_then(Value::as_str).unwrap_or("");
        return Err(format!("B站接口 {api} 返回错误 {code}: {message}"));
    }
    json.get("data")
        .cloned()
        .ok_or_else(|| format!("B站接口 {api} 响应缺少 data 字段"))
}

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(10))
            .build()
            .expect("failed to build reqwest client")
    })
}

fn str_field(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

/// Numeric fields that may arrive as JSON numbers or strings (ids like
/// `mid`/`season_id` exceed JS precision, so Bilibili mixes both).
fn id_string(value: &Value, key: &str) -> String {
    match value.get(key) {
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::String(s)) => s.clone(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::from_str;

    const VIEW_MULTI_P: &str = r#"{
        "code": 0,
        "data": {
            "bvid": "BV1gq4y167mq",
            "title": "【阿梓】伤感苦情歌全收录",
            "duration": 49310,
            "pages": [
                {"page": 1, "cid": 445543037, "part": "默", "duration": 295},
                {"page": 2, "cid": 444115236, "part": "Melody", "duration": 254},
                {"page": 3, "cid": 445562062, "part": "蝇", "duration": 241}
            ]
        }
    }"#;

    const VIEW_SEASON: &str = r#"{
        "code": 0,
        "data": {
            "bvid": "BV1q1hJ6wEf3",
            "title": "某支视频",
            "duration": 182,
            "pages": [{"page": 1, "cid": 1, "part": "正片", "duration": 182}],
            "ugc_season": {
                "id": 8317438,
                "mid": 3546570674932451,
                "title": "懒人小妙招",
                "sections": [{
                    "episodes": [
                        {"bvid": "BV1KKFSzYERF", "cid": 100, "title": "懒人必看！5个简单小妙招让年夜饭轻松到夯", "arc": {"duration": 182}},
                        {"bvid": "BV1abc0000000", "cid": 101, "title": "第二集", "arc": {"duration": 60}}
                    ]
                }]
            }
        }
    }"#;

    const VIEW_SINGLE: &str = r#"{
        "code": 0,
        "data": {
            "bvid": "BV1GJ411x7h7",
            "title": "【官方 MV】Never Gonna Give You Up - Rick Astley",
            "duration": 213,
            "pages": [{"page": 1, "cid": 80062, "part": "", "duration": 213}]
        }
    }"#;

    const SEASON_ARCHIVES_PAGE: &str = r#"{
        "code": 0,
        "data": {
            "archives": [
                {"bvid": "BV1KKFSzYERF", "title": "懒人必看！5个简单小妙招让年夜饭轻松到夯", "duration": 182},
                {"bvid": "BV1abc0000000", "title": "", "duration": 60}
            ],
            "meta": {"name": "合集·懒人小妙招", "total": 11, "season_id": 8317438, "mid": 3546570674932451}
        }
    }"#;

    const SERIES_ARCHIVES_PAGE: &str = r#"{
        "code": 0,
        "data": {
            "archives": [{"bvid": "BV1series0001", "title": "S1", "duration": 30}],
            "page": {"size": 30, "total": 1, "count": 1}
        }
    }"#;

    fn view_data_of(fixture: &str) -> Value {
        api_data(from_str(fixture).expect("fixture json"), "view").expect("fixture data")
    }

    #[test]
    fn extract_video_ref_accepts_bv_av_and_ignores_query() {
        assert_eq!(
            extract_video_ref("https://www.bilibili.com/video/BV1gq4y167mq/?spm_id_from=333.337"),
            Some(VideoRef::Bvid("BV1gq4y167mq".into()))
        );
        assert_eq!(
            extract_video_ref("https://www.bilibili.com/video/BV1gq4y167mq?p=3&t=30"),
            Some(VideoRef::Bvid("BV1gq4y167mq".into()))
        );
        assert_eq!(
            extract_video_ref("https://www.bilibili.com/video/av170001"),
            Some(VideoRef::Aid("170001".into()))
        );
        assert_eq!(
            extract_video_ref("https://www.bilibili.com/video/BVshort"),
            None
        );
        assert_eq!(
            extract_video_ref("https://www.bilibili.com/watchlater/#list"),
            None
        );
        assert_eq!(
            extract_video_ref("https://example.com/video/BV1gq4y167mq"),
            None
        );
        assert_eq!(extract_video_ref("https://b23.tv/AbCdEf"), None);
        assert_eq!(
            extract_video_ref("https://space.bilibili.com/1/channel/collectiondetail?sid=2"),
            None
        );
    }

    #[test]
    fn parse_space_list_matches_both_kinds() {
        assert_eq!(
            parse_space_list(
                "https://space.bilibili.com/2142762/channel/collectiondetail?sid=57445&spm=x"
            ),
            Some(SpaceList {
                mid: "2142762".into(),
                sid: "57445".into(),
                series: false
            })
        );
        assert_eq!(
            parse_space_list(
                "https://space.bilibili.com/1958703906/channel/seriesdetail?sid=547718&ctype=0"
            ),
            Some(SpaceList {
                mid: "1958703906".into(),
                sid: "547718".into(),
                series: true
            })
        );
        assert_eq!(
            parse_space_list("https://space.bilibili.com/1/channel/collectiondetail"),
            None
        );
        assert_eq!(
            parse_space_list("https://space.bilibili.com/1/channel/collectiondetail?sid=abc"),
            None
        );
        assert_eq!(
            parse_space_list("https://space.bilibili.com/abc/channel/collectiondetail?sid=2"),
            None
        );
        assert_eq!(
            parse_space_list("https://space.bilibili.com/1/channel/list?sid=2"),
            None
        );
    }

    #[test]
    fn query_param_reads_url_query() {
        assert_eq!(
            query_param("https://www.bilibili.com/video/BV1gq4y167mq?p=3", "p"),
            Some("3".into())
        );
        assert_eq!(
            query_param("https://www.bilibili.com/video/BV1gq4y167mq", "p"),
            None
        );
    }

    #[test]
    fn multi_p_view_yields_page_episodes() {
        let ViewOutcome::MultiP(probe) = classify_view(&view_data_of(VIEW_MULTI_P)) else {
            panic!("expected multi_p");
        };
        assert_eq!(probe.kind, "multi_p");
        assert_eq!(probe.title, "【阿梓】伤感苦情歌全收录");
        assert_eq!(probe.episodes.len(), 3);
        let third = &probe.episodes[2];
        assert_eq!(third.index, 3);
        assert_eq!(third.bvid, "BV1gq4y167mq");
        assert_eq!(third.page, Some(3));
        assert_eq!(third.title, "p03 蝇");
        assert_eq!(third.duration, 241.0);
    }

    #[test]
    fn season_view_extracts_list_ids_and_embedded_episodes() {
        let ViewOutcome::List {
            mid,
            season_id,
            embedded,
        } = classify_view(&view_data_of(VIEW_SEASON))
        else {
            panic!("expected list");
        };
        assert_eq!(mid, "3546570674932451");
        assert_eq!(season_id, "8317438");
        assert_eq!(embedded.kind, "list");
        assert_eq!(embedded.title, "懒人小妙招");
        assert_eq!(embedded.episodes.len(), 2);
        let first = &embedded.episodes[0];
        assert_eq!(first.bvid, "BV1KKFSzYERF");
        assert_eq!(first.page, None);
        assert_eq!(first.duration, 182.0);
        assert_eq!(embedded.episodes[1].index, 2);
    }

    #[test]
    fn single_view_has_no_episodes() {
        let ViewOutcome::Single(probe) = classify_view(&view_data_of(VIEW_SINGLE)) else {
            panic!("expected single");
        };
        assert_eq!(probe.kind, "single");
        assert_eq!(probe.episodes, Vec::new());
        assert_eq!(
            probe.title,
            "【官方 MV】Never Gonna Give You Up - Rick Astley"
        );
    }

    #[test]
    fn archives_page_maps_title_and_episodes() {
        let data = api_data(
            from_str::<Value>(SEASON_ARCHIVES_PAGE).expect("fixture json"),
            "seasons_archives_list",
        )
        .expect("fixture data");
        let title = data
            .pointer("/meta/name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let mut episodes = Vec::new();
        append_archives(
            &mut episodes,
            data.get("archives")
                .and_then(Value::as_array)
                .expect("archives"),
        );
        assert_eq!(title, "合集·懒人小妙招");
        assert_eq!(episodes.len(), 2);
        assert_eq!(episodes[0].bvid, "BV1KKFSzYERF");
        assert_eq!(episodes[1].title, "BV1abc0000000");
        assert_eq!(episodes[1].index, 2);
    }

    #[test]
    fn series_page_maps_episodes() {
        let data = api_data(
            from_str::<Value>(SERIES_ARCHIVES_PAGE).expect("fixture json"),
            "series_archives",
        )
        .expect("fixture data");
        let mut episodes = Vec::new();
        append_archives(
            &mut episodes,
            data.get("archives")
                .and_then(Value::as_array)
                .expect("archives"),
        );
        assert_eq!(episodes.len(), 1);
        assert_eq!(episodes[0].bvid, "BV1series0001");
    }

    #[test]
    fn api_data_surfaces_error_code_and_message() {
        let json: Value = from_str(r#"{"code": -404, "message": "啥都木有"}"#).expect("json");
        let err = api_data(json, "view").expect_err("should fail");
        assert!(err.contains("-404") && err.contains("啥都木有"));
    }

    /// Manual smoke test against the live bilibili API (network required):
    /// `cargo test -- --ignored probe_live`
    #[test]
    #[ignore = "hits the real bilibili API; network required"]
    fn probe_live_multi_p() {
        let probe = tauri::async_runtime::block_on(super::probe(
            "https://www.bilibili.com/video/BV1gq4y167mq/?spm_id_from=333.337.search-card.all.click",
        ))
        .expect("probe should succeed");
        assert_eq!(probe.kind, "multi_p");
        assert_eq!(probe.title, "【阿梓】伤感苦情歌全收录");
        assert_eq!(probe.episodes.len(), 200);
        assert_eq!(probe.episodes[2].title, "p03 蝇");
    }

    /// Manual smoke test: a video-page season resolves through the paginated
    /// season API. `cargo test -- --ignored probe_live`
    #[test]
    #[ignore = "hits the real bilibili API; network required"]
    fn probe_live_season() {
        let probe = tauri::async_runtime::block_on(super::probe(
            "https://www.bilibili.com/video/BV1q1hJ6wEf3/",
        ))
        .expect("probe should succeed");
        assert_eq!(probe.kind, "list");
        assert_eq!(probe.title, "合集·懒人小妙招");
        assert!(probe.episodes.len() >= 11);
        assert!(probe.episodes.iter().all(|ep| ep.bvid.starts_with("BV")));
    }

    /// Manual smoke test: space collection URL. `cargo test -- --ignored probe_live`
    #[test]
    #[ignore = "hits the real bilibili API; network required"]
    fn probe_live_space_collection() {
        let probe = tauri::async_runtime::block_on(super::probe(
            "https://space.bilibili.com/3546570674932451/channel/collectiondetail?sid=8317438",
        ))
        .expect("probe should succeed");
        assert_eq!(probe.kind, "list");
        assert!(probe.episodes.len() >= 11);
    }
}
