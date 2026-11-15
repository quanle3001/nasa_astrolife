#!/usr/bin/env python3
"""Fetch curated NASA Image and Video Library assets for offline mission cards.

This utility uses only the Python standard library. It inspects the NASA asset
manifest rather than constructing asset URLs, stores provenance, and replaces
files atomically. Run it manually when refreshing bundled decorative media;
the desktop app never needs network access.

Short preview clips are opt-in (``--with-video``). Each clip is validated as
an MP4 served by images-assets.nasa.gov, capped at ``MAX_VIDEO_BYTES``, and
recorded with its own NASA ID, credit and an honest classification (real
footage vs. data visualization). Missions without a suitable short clip keep
their still image, which the UI also uses as the video poster.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import ssl
import tempfile
from urllib.parse import quote, unquote, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen


API_ROOT = "https://images-api.nasa.gov"
LIBRARY_ROOT = "https://images.nasa.gov/details/"
ASSET_HOST = "images-assets.nasa.gov"
MAX_VIDEO_BYTES = 4 * 1024 * 1024
ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = ROOT / "assets" / "nasa"

SELECTIONS = (
    {
        "mission": "leo",
        "nasa_id": "iss058e005282",
        "search_query": "international space station earth limb aurora",
        "classification": "Photograph",
    },
    {
        "mission": "lunar",
        "nasa_id": "as17-134-20473",
        "search_query": "apollo 17 lunar surface earth",
        "classification": "Photograph · historical Apollo surface reference",
        "video": {
            "nasa_id": "GSFC_20190513_m4714_Lee_Lincoln_Scarp_Moon_Flyover",
            "search_query": "Lee Lincoln Scarp Apollo 17 landing site",
            "classification": "Data visualization · LRO terrain flyover, not footage",
        },
    },
    {
        "mission": "mars",
        "nasa_id": "PIA24264",
        "search_query": "Mastcam-Z first 360 degree panorama",
        "classification": "Rover panorama mosaic",
        "video": {
            "nasa_id": "JPL-20210222-M2020f-0002-NASA’S Perseverance Rover’s First 360 View of Mars",
            "search_query": "Perseverance Rover First 360 View of Mars",
            "classification": "Real rover imagery · Mastcam-Z panorama pan",
        },
    },
)


def tls_context():
    """Use the system CA bundle when a portable Python lacks a valid default."""
    candidates = (Path("/etc/ssl/cert.pem"), Path("/private/etc/ssl/cert.pem"))
    cafile = next((path for path in candidates if path.exists()), None)
    return ssl.create_default_context(cafile=str(cafile) if cafile else None)


TLS_CONTEXT = tls_context()


def get_json(url: str) -> dict:
    request = Request(url, headers={"User-Agent": "AstroTip-NASA-media-cache/1.0"})
    with urlopen(request, timeout=30, context=TLS_CONTEXT) as response:
        return json.load(response)


def safe_url(url: str) -> str:
    """Force HTTPS and percent-encode the path (NASA IDs may contain spaces)."""
    parts = urlsplit(url.replace("http://", "https://", 1))
    return urlunsplit((parts.scheme, parts.netloc, quote(unquote(parts.path)), parts.query, ""))


def download(url: str, target: Path, *, max_bytes: int | None = None, content_type: str | None = None) -> int:
    target.parent.mkdir(parents=True, exist_ok=True)
    request = Request(safe_url(url), headers={"User-Agent": "AstroTip-NASA-media-cache/1.0"})
    written = 0
    with urlopen(request, timeout=60, context=TLS_CONTEXT) as response:
        served_type = response.headers.get_content_type()
        if content_type and served_type != content_type:
            raise ValueError(f"Expected {content_type} from {url}, got {served_type}")
        suffix = target.suffix or ".bin"
        with tempfile.NamedTemporaryFile(dir=target.parent, suffix=suffix, delete=False) as handle:
            temporary = Path(handle.name)
            while chunk := response.read(1024 * 256):
                written += len(chunk)
                if max_bytes and written > max_bytes:
                    handle.close()
                    temporary.unlink(missing_ok=True)
                    raise ValueError(f"{url} exceeds the {max_bytes} byte preview limit")
                handle.write(chunk)
    os.replace(temporary, target)
    os.chmod(target, 0o644)
    return written


def choose_image_url(items: list[dict]) -> str:
    urls = [item.get("href", "") for item in items]
    images = [url for url in urls if url.lower().split("?")[0].endswith((".jpg", ".jpeg", ".png"))]
    for marker in ("~medium", "~large", "~orig"):
        match = next((url for url in images if marker in url.lower()), None)
        if match:
            return match
    if not images:
        raise ValueError("NASA asset manifest contains no supported image")
    return images[0]


def choose_video_url(items: list[dict]) -> str:
    urls = [item.get("href", "") for item in items]
    # Smallest rendition that still looks sharp on a ~400px card; mobile (320x180) is the fallback.
    for marker in ("~preview.mp4", "~mobile.mp4"):
        match = next((url for url in urls if url.lower().endswith(marker)), None)
        if match:
            if urlsplit(match).hostname != ASSET_HOST:
                raise ValueError(f"Unexpected NASA asset host in {match}")
            return match
    raise ValueError("NASA asset manifest contains no small MP4 rendition")


def search(selection: dict, media_type: str = "image") -> dict:
    query = urlencode({"q": selection["search_query"], "media_type": media_type, "page_size": 20})
    result = get_json(f"{API_ROOT}/search?{query}")
    items = result.get("collection", {}).get("items", [])
    return next(
        (item["data"][0] for item in items if item.get("data") and item["data"][0].get("nasa_id") == selection["nasa_id"]),
        {},
    )


def fetch_video(mission: str, selection: dict) -> dict:
    nasa_id = selection["nasa_id"]
    search_data = search(selection, media_type="video")
    if not search_data:
        raise ValueError(f"{nasa_id} was not found by the NASA video search")
    manifest = get_json(f"{API_ROOT}/asset/{quote(nasa_id, safe='')}")
    video_url = choose_video_url(manifest.get("collection", {}).get("items", []))
    relative_path = Path("videos") / f"{mission}.mp4"
    size = download(video_url, OUTPUT_ROOT / relative_path, max_bytes=MAX_VIDEO_BYTES, content_type="video/mp4")
    return {
        "nasa_id": nasa_id,
        "title": search_data.get("title") or nasa_id,
        "classification": selection["classification"],
        "credit": search_data.get("center") or "NASA",
        "date_created": search_data.get("date_created", ""),
        "media_type": "video",
        "local_path": relative_path.as_posix(),
        "size_bytes": size,
        "asset_url": video_url,
        "source_url": f"{LIBRARY_ROOT}{quote(nasa_id)}",
    }


def fetch_selection(selection: dict, with_video: bool = False) -> dict:
    nasa_id = selection["nasa_id"]
    encoded_id = quote(nasa_id, safe="")
    search_data = search(selection)
    asset_manifest = get_json(f"{API_ROOT}/asset/{encoded_id}")
    image_url = choose_image_url(asset_manifest.get("collection", {}).get("items", []))
    metadata_pointer = get_json(f"{API_ROOT}/metadata/{encoded_id}")
    metadata_url = metadata_pointer.get("location")
    metadata = get_json(metadata_url) if metadata_url else {}
    extension = Path(image_url.split("?", 1)[0]).suffix.lower() or ".jpg"
    if extension == ".jpeg":
        extension = ".jpg"
    relative_path = Path("images") / f"{selection['mission']}{extension}"
    download(image_url, OUTPUT_ROOT / relative_path)
    title = search_data.get("title") or metadata.get("AVAIL:Title") or nasa_id
    photographer = search_data.get("photographer") or metadata.get("AVAIL:Photographer")
    center = search_data.get("center") or metadata.get("AVAIL:Center") or "NASA"
    entry = {
        "mission": selection["mission"],
        "nasa_id": nasa_id,
        "title": title,
        "classification": selection["classification"],
        "credit": photographer or center,
        "date_created": search_data.get("date_created", ""),
        "description": search_data.get("description", ""),
        "media_type": "image",
        "local_path": relative_path.as_posix(),
        "asset_url": image_url,
        "metadata_url": metadata_url,
        "source_url": f"{LIBRARY_ROOT}{quote(nasa_id)}",
    }
    if with_video and selection.get("video"):
        entry["video"] = fetch_video(selection["mission"], selection["video"])
    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mission", choices=("leo", "lunar", "mars"), action="append")
    parser.add_argument("--with-video", action="store_true", help="also cache short preview clips where curated")
    args = parser.parse_args()
    wanted = set(args.mission or ("leo", "lunar", "mars"))
    assets = [fetch_selection(item, args.with_video) for item in SELECTIONS if item["mission"] in wanted]
    manifest_path = OUTPUT_ROOT / "media_manifest.json"
    previous = {}
    if manifest_path.exists():
        previous = json.loads(manifest_path.read_text(encoding="utf-8"))
    retained = [item for item in previous.get("assets", []) if item.get("mission") not in wanted]
    if not args.with_video:
        # Keep previously cached clips when only refreshing stills.
        old = {item.get("mission"): item.get("video") for item in previous.get("assets", [])}
        for item in assets:
            if old.get(item["mission"]) and (OUTPUT_ROOT / old[item["mission"]]["local_path"]).exists():
                item["video"] = old[item["mission"]]
    payload = {
        "schema_version": 2,
        "notice": "Decorative NASA media. NASA does not endorse AstroTip.",
        "api": API_ROOT,
        "assets": sorted(retained + assets, key=lambda item: item["mission"]),
    }
    manifest_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Cached {len(assets)} asset(s) in {OUTPUT_ROOT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
