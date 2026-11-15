# NASA decorative media cache

These assets are decorative mission-context imagery obtained through the NASA
Image and Video Library API. `media_manifest.json` records the NASA asset ID,
classification, source page, credit, original asset URL, and metadata URL.

NASA does not endorse AstroLife. The application does not use NASA insignia or
logotypes as AstroLife branding. Refresh the curated offline images with:

```bash
python software/scripts/fetch_nasa_media.py
```

The script calls `/search`, inspects `/asset/{nasa_id}`, and preserves the
metadata pointer from `/metadata/{nasa_id}`. The running desktop application
does not download anything and remains fully usable offline.
