use std::io::Cursor;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::thread;
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

use crate::commands::path_within;

/// Managed state so the `audio_url` command can build a URL for the current port.
pub struct AudioServerState {
    pub port: u16,
}

/// Start a loopback HTTP server that serves files under `root`, and return the
/// OS-assigned port. WebKitGTK's GStreamer backend can only load `<audio>`/`<video>`
/// media over a standard `http(s)://` scheme — it rejects `asset://` and `blob:` —
/// so cached audio is exposed here instead of through the asset protocol.
pub fn start(root: PathBuf) -> Result<u16, String> {
    // Ensure the root exists so containment checks can canonicalize it.
    let _ = std::fs::create_dir_all(&root);

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let server = Server::from_listener(listener, None).map_err(|e| e.to_string())?;

    thread::spawn(move || {
        for request in server.incoming_requests() {
            if let Err(e) = handle(request, &root) {
                eprintln!("audio_server: failed to respond: {e}");
            }
        }
    });

    Ok(port)
}

/// Serve one request. `root` is the app data directory; the URL path maps to a
/// path relative to it (e.g. `/audio/BV.ogg` → `<root>/audio/BV.ogg`).
fn handle(request: Request, root: &Path) -> std::io::Result<()> {
    let path = request.url().split('?').next().unwrap_or("/");
    let rel = path.trim_start_matches('/');
    let target = root.join(rel);

    // Reject anything outside the root (path traversal, symlink escape).
    if !path_within(root, &target) {
        return request.respond(Response::from_string("forbidden").with_status_code(StatusCode(403)));
    }

    let mime = mime_for(&target);

    let data = match std::fs::read(&target) {
        Ok(data) => data,
        Err(_) => {
            return request.respond(Response::from_string("not found").with_status_code(StatusCode(404)));
        }
    };
    let total = data.len();

    if *request.method() == Method::Head {
        return request.respond(head_response(mime, total));
    }

    // Honour a single `Range` request so the client can seek (this is what lets
    // the progress bar / drag-to-seek keep working over HTTP). Malformed or
    // multi-range requests fall through to a plain 200.
    if let Some(value) = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))
        .map(|h| h.value.as_str().to_string())
    {
        if let Some((start, end)) = parse_range(&value, total) {
            let slice = &data[start..end];
            return request.respond(
                Response::from_data(slice.to_vec())
                    .with_status_code(StatusCode(206))
                    .with_header(header("Content-Type", mime))
                    .with_header(header("Accept-Ranges", "bytes"))
                    .with_header(header("Content-Range", &format!("bytes {start}-{}/{}", end - 1, total))),
            );
        }
    }

    request.respond(
        Response::from_data(data)
            .with_header(header("Content-Type", mime))
            .with_header(header("Accept-Ranges", "bytes")),
    )
}

/// A HEAD response advertises the resource length without sending the body.
fn head_response(mime: &'static str, total: usize) -> Response<Cursor<Vec<u8>>> {
    Response::new(
        StatusCode(200),
        vec![
            header("Content-Type", mime),
            header("Content-Length", &total.to_string()),
            header("Accept-Ranges", "bytes"),
        ],
        Cursor::new(Vec::new()),
        None,
        None,
    )
}

/// Build a header from ASCII literals/values (all our values are ASCII).
fn header(name: &'static str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("header bytes are ASCII")
}

/// Map a file extension to the MIME type the browser should receive.
fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("ogg") | Some("oga") | Some("opus") => "audio/ogg",
        Some("m4a") | Some("m4s") | Some("mp4") | Some("aac") => "audio/mp4",
        Some("mp3") => "audio/mpeg",
        _ => "application/octet-stream",
    }
}

/// Parse `bytes=start-end` / `bytes=start-` / `bytes=-suffix` into a half-open
/// `[start, end)` byte range. Returns `None` for multi-range or malformed input,
/// in which case the caller serves the full body.
fn parse_range(value: &str, total: usize) -> Option<(usize, usize)> {
    if total == 0 {
        return None;
    }
    let spec = value.strip_prefix("bytes=")?;
    if spec.contains(',') {
        return None; // multi-range is not supported; fall back to 200
    }
    let (start_s, end_s) = spec.split_once('-')?;

    if start_s.is_empty() {
        // suffix range: last N bytes
        let n: usize = end_s.parse().ok()?;
        if n == 0 {
            return None;
        }
        let start = total.saturating_sub(n);
        return Some((start, total));
    }

    let start: usize = start_s.parse().ok()?;
    if start >= total {
        return None; // unsatisfiable
    }
    let end = if end_s.is_empty() {
        total
    } else {
        let inclusive: usize = end_s.parse().ok()?;
        (inclusive + 1).min(total)
    };
    if end <= start {
        return None;
    }
    Some((start, end))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_open_ended_range() {
        assert_eq!(parse_range("bytes=0-", 1000), Some((0, 1000)));
        assert_eq!(parse_range("bytes=500-", 1000), Some((500, 1000)));
    }

    #[test]
    fn parses_closed_range() {
        assert_eq!(parse_range("bytes=0-499", 1000), Some((0, 500)));
        assert_eq!(parse_range("bytes=100-199", 1000), Some((100, 200)));
    }

    #[test]
    fn parses_suffix_range() {
        assert_eq!(parse_range("bytes=-500", 1000), Some((500, 1000)));
        assert_eq!(parse_range("bytes=-2000", 1000), Some((0, 1000)));
    }

    #[test]
    fn rejects_invalid_ranges() {
        assert_eq!(parse_range("bytes=1000-", 1000), None); // start past end
        assert_eq!(parse_range("bytes=-0", 1000), None);
        assert_eq!(parse_range("bytes=0-499,600-699", 1000), None); // multi-range
        assert_eq!(parse_range("bytes=abc-", 1000), None);
        assert_eq!(parse_range("bytes=5-2", 1000), None); // empty range
        assert_eq!(parse_range("", 1000), None);
        assert_eq!(parse_range("bytes=0-", 0), None); // empty file
    }

    #[test]
    fn maps_mime_by_extension() {
        assert_eq!(mime_for(Path::new("a.ogg")), "audio/ogg");
        assert_eq!(mime_for(Path::new("a.m4a")), "audio/mp4");
        assert_eq!(mime_for(Path::new("a.mp3")), "audio/mpeg");
        assert_eq!(mime_for(Path::new("a.bin")), "application/octet-stream");
    }

    #[test]
    fn serves_file_with_range_support() {
        use std::io::{Read, Write};
        use std::net::TcpStream;
        use std::time::Duration;

        let root = std::env::temp_dir().join("bilibili-board-http-root");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("test.ogg"), vec![b'a'; 100]).unwrap();

        let port = start(root.clone()).unwrap();

        let get = |range: Option<&str>| {
            let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
            let mut req = b"GET /test.ogg HTTP/1.0\r\nHost: localhost\r\n".to_vec();
            if let Some(r) = range {
                req.extend_from_slice(format!("Range: {r}\r\n").as_bytes());
            }
            req.extend_from_slice(b"\r\n");
            stream.write_all(&req).unwrap();
            let mut response = String::new();
            stream.read_to_string(&mut response).unwrap();
            response
        };

        let full = get(None);
        assert!(full.starts_with("HTTP/1.0 200"), "unexpected response: {full}");
        assert!(full.contains("Accept-Ranges: bytes"));
        assert!(full.contains("Content-Type: audio/ogg"));

        let partial = get(Some("bytes=10-19"));
        assert!(partial.starts_with("HTTP/1.0 206"), "unexpected response: {partial}");
        assert!(partial.contains("Content-Range: bytes 10-19/100"), "unexpected response: {partial}");

        let _ = std::fs::remove_dir_all(&root);
    }
}
