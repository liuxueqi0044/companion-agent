# Production transition replay evidence

These four MP4s are assembled from the actual browser PNG captures and their recorded `elapsedMs`, using variable frame presentation timestamps. Their measured capture rates are 5.45–6.13 samples per second and serve geometry/direction review. They are not 60 fps browser recordings and do not establish runtime smoothness.

| Replay | Samples | Source → output | Captured span | MP4 duration | Average capture rate |
| --- | ---: | --- | ---: | ---: | ---: |
| [A](../M07/replay-A.mp4) | 28 | 1280×720 → 1280×720 | 4.638 s | 4.639 s | 5.821 samples/s |
| [B](../M07/replay-B.mp4) | 26 | 1280×720 → 1280×720 | 4.211 s | 4.212 s | 5.937 samples/s |
| [A-reverse](../M07/replay-A-reverse.mp4) | 28 | 1280×720 → 1280×720 | 4.410 s | 4.411 s | 6.122 samples/s |
| [B-reverse](../M07/replay-B-reverse.mp4) | 27 | 1280×720 → 1280×720 | 4.770 s | 4.771 s | 5.451 samples/s |

## Timing and image handling

The first actual captured timestamp is normalized to video time zero. Every subsequent presentation timestamp was checked with ffprobe and matches the original millisecond interval exactly. The final sample receives one millisecond so it remains a real final video frame; no additional ending hold, interpolation, fabricated frames or audio is added. An odd source dimension is padded by one neutral pixel for H.264 4:2:0, rather than stretching the browser image. The original PNGs and timestamp JSON remain unchanged.

The encoder’s nominal frame-rate field can be high because the clock is 1/1000 second; it does not describe the capture rate. Use the measured sample count and timestamps in [replay-media-report.json](replay-media-report.json).

## Five sampled checkpoints per transition

A0–A4 and B0–B4 are byte-for-byte copies of the nearest browser frames to 0/25/50/75/100% transition progress. Filenames include `sampled`; these are not exact seek frames. The report records both requested and actual normalized progress, original story progress, frame number and elapsed timestamp. Reverse replay preserves original captured order and timestamps.

These artifacts use the browser replay capture directories only. They do not reference the discarded viewport-clipped multi-size screenshot set. Browser navigation, dialog behavior, responsive stills and runtime performance are covered by the separate root acceptance record.

Reproduce from the project root: `node tools/rebuild-proof-media.mjs`. Existing FFmpeg/ffprobe binaries are used; no new software is installed. Override paths with `MORROW_FFMPEG` and `MORROW_FFPROBE` if moving the project.
