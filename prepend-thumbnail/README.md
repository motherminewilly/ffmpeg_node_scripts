# Prepend Thumbnail Script

This script creates a short thumbnail video from an image and prepends it to a short video. The final output is always an `.mp4` file. It also logs and saves the configuration with execution history.

---

## Features

- Generates a thumbnail video from a still image (default ~1 second, adjustable).
- Prepends the thumbnail video to a short video using FFmpeg.
- Ensures output format is always `.mp4`.
- Displays the FFmpeg commands being executed.
- Interactive overwrite prompt if the output file already exists.
- Saves a copy of the configuration with execution history (timestamp, original config filename, Git commit ID if available).

---

## Requirements

- **Node.js** (>= 18 recommended).
- **FFmpeg** installed and available at the path provided in the config.
- Absolute paths are strongly recommended for inputs and outputs.

---

## Usage

```bash
node prepend-thumbnail.js path/to/config.js
```

The config file can be:

- A JavaScript module (.js, .mjs, .cjs) exporting an object.
- A JSON file (less flexible).

## Example Config File (config.js)

```js
export default {
  ffmpegOptions: {
    // Absolute path to your FFmpeg binary
    pathFFMPEG:
      "/c/ProgramData/chocolatey/lib/ffmpeg/tools/ffmpeg/bin/ffmpeg.exe",
  },
  fileOptions: {
    // Path to your short video file
    pathShortInput: "D:/youtube_slicer_output/short_video.webm",

    // Path to the image that will become the thumbnail video
    pathToThumbnailImage: "D:/youtube_slicer_output/image_short.jpg",

    // Path to the final output video (without extension)
    pathFileOutputWithoutExtension:
      "D:/youtube_slicer_output/short_final_output",

    // Directory where the executed config (with history) will be saved
    pathToSaveConfig: "D:/youtube_slicer_output/config_history",
  },
  shortOptions: {
    // Duration of the thumbnail video in milliseconds
    thumbnailVideoMilliseconds: 1000,
  },
};
```

---

## Output

1. A thumbnail video file is generated from the image.
2. The thumbnail video and the short video are concatenated.
3. Final output file: `short_final_output.mp4`.
4. A config copy is saved to the `pathToSaveConfig` directory, containing:

- `executed_at` timestamp.
- `originalConfigFileName`.
- `commit_id`(if executed in a git repository).

---

## Notes

- If the output file already exists, the script will ask:

```
File '.../short_final_output.mp4' already exists. Overwrite? [y/N]
```

- Answer `y` to overwrite or `n` to abort.
- All paths in the config should be absolute paths to avoid issues.
- The thumbnail video duration can be adjusted via `thumbnailVideoMilliseconds`.

---

## Example Run

```bash
node prepend-thumbnail.js D:/youtube_slicer_output/config.js
```

This will:

- Generate a thumbnail video from `image_short.jpg`.
- Prepend it to `short_video.webm`.
- Save the final result as `short_final_output.mp4`.
- Save a copy of the config with history into `config_history/`.
