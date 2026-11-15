#!/usr/bin/env python3
"""Fetch curated NASA Image and Video Library assets for offline mission cards.

This utility uses only the Python standard library. It inspects the NASA asset
manifest rather than constructing asset URLs, stores provenance, and replaces
files atomically. Run it manually when refreshing bundled decorative media;
the desktop app never needs network access.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import ssl
import tempfile
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


API_ROOT = "https://images-api.nasa.gov"
LIBRARY_ROOT = "https://images.nasa.gov/details/"
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
    },
    {
        "mission": "mars",
        "nasa_id": "PIA24264",
        "search_query": "Mastcam-Z first 360 degree panorama",
        "classification": "Rover panorama mosaic",
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


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    request = Request(url, headers={"User-Agent": "AstroTip-NASA-media-cache/1.0"})
    with urlopen(request, timeout=60, context=TLS_CONTEXT) as response:
        suffix = target.suffix or ".bin"
        with tempfile.NamedTemporaryFile(dir=target.parent, suffix=suffix, delete=False) as handle:
            temporary = Path(handle.name)
            while chunk := response.read(1024 * 256):
                handle.write(chunk)
    os.replace(temporary, target)


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


def search(selection: dict) -> dict:
    query = urlencode({"q": selection["search_query"], "media_type": "image", "page_size": 20})
    result = get_json(f"{API_ROOT}/search?{query}")
    items = result.get("collection", {}).get("items", [])
    return next(
        (item["data"][0] for item in items if item.get("data") and item["data"][0].get("nasa_id") == selection["nasa_id"]),
        {},
    )


def fetch_selection(selection: dict) -> dict:
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
    return {
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mission", choices=("leo", "lunar", "mars"), action="append")
    args = parser.parse_args()
    wanted = set(args.mission or ("leo", "lunar", "mars"))
    assets = [fetch_selection(item) for item in SELECTIONS if item["mission"] in wanted]
    manifest_path = OUTPUT_ROOT / "media_manifest.json"
    previous = {}
    if manifest_path.exists():
        previous = json.loads(manifest_path.read_text(encoding="utf-8"))
    retained = [item for item in previous.get("assets", []) if item.get("mission") not in wanted]
    payload = {
        "schema_version": 1,
        "notice": "Decorative NASA media. NASA does not endorse AstroTip.",
        "api": API_ROOT,
        "assets": sorted(retained + assets, key=lambda item: item["mission"]),
    }
    manifest_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Cached {len(assets)} asset(s) in {OUTPUT_ROOT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
