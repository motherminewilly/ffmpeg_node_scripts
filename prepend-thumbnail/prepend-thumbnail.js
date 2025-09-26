import fs from "fs";
import path from "path";
import { spawnSync, execSync } from "child_process";
import readline from "readline";
import url from "url";

function isAbsolute(p) {
  return path.isAbsolute(p);
}

function toAbs(p, base) {
  if (!p) return p;
  return isAbsolute(p) ? p : path.resolve(base || process.cwd(), p);
}

async function promptYesNo(question, defaultNo = true) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const q = `${question} ${defaultNo ? "[y/N]" : "[Y/n]"} `;
  return new Promise((resolve) => {
    rl.question(q, (answer) => {
      rl.close();
      const a = (answer || "").trim().toLowerCase();
      if (a === "y" || a === "yes") return resolve(true);
      if (a === "n" || a === "no") return resolve(false);
      return resolve(!defaultNo);
    });
  });
}

function runCommand(cmd, args, env = process.env) {
  console.log("\nRunning command:");
  console.log(cmd + " " + args.map((a) => `"${a}"`).join(" "));
  const res = spawnSync(cmd, args, { stdio: "inherit", env });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`${cmd} exited with code ${res.status}`);
  }
}

function tryGetGitCommit() {
  try {
    execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" });
    const commit = execSync("git rev-parse HEAD").toString().trim();
    return commit;
  } catch (e) {
    return undefined;
  }
}

async function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error(
      "Usage: node prepend-thumbnail.js path/to/config.js (or .json)"
    );
    process.exit(1);
  }

  const configAbs = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(configAbs)) {
    console.error(`Config file not found: ${configAbs}`);
    process.exit(1);
  }

  // Load config: prefer JS module for flexible (not strict JSON) format.
  let config;
  const ext = path.extname(configAbs).toLowerCase();
  try {
    if (ext === ".js" || ext === ".cjs" || ext === ".mjs") {
      // dynamically import using file:// URL so ESM works
      const fileUrl = url.pathToFileURL(configAbs).href;
      const mod = await import(fileUrl);
      config = mod.default || mod;
    } else {
      // fallback to parse JSON
      const raw = fs.readFileSync(configAbs, "utf-8");
      config = JSON.parse(raw);
    }
  } catch (err) {
    console.error("Failed to load config:", err);
    process.exit(1);
  }

  // Validate and resolve absolute paths
  const baseDir = path.dirname(configAbs);
  if (!config.ffmpegOptions || !config.ffmpegOptions.pathFFMPEG) {
    console.error("ffmpegOptions.pathFFMPEG is required in config");
    process.exit(1);
  }

  const ffmpegPath = toAbs(config.ffmpegOptions.pathFFMPEG, baseDir);
  const fileOptions = config.fileOptions || {};
  const shortInput = toAbs(fileOptions.pathShortInput, baseDir);
  const imagePath = toAbs(fileOptions.pathToThumbnailImage, baseDir);
  const outputBase = toAbs(fileOptions.pathFileOutputWithoutExtension, baseDir);
  const saveConfigPath = toAbs(fileOptions.pathToSaveConfig, baseDir);

  const shortOpts = config.shortOptions || {};
  const thumbMs = shortOpts.thumbnailVideoMilliseconds || 1000;
  const thumbnailSeconds = Math.max(0.01, thumbMs / 1000);

  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    console.error(`FFmpeg binary not found at: ${ffmpegPath}`);
    process.exit(1);
  }
  if (!shortInput || !fs.existsSync(shortInput)) {
    console.error(`Short input video not found at: ${shortInput}`);
    process.exit(1);
  }
  if (!imagePath || !fs.existsSync(imagePath)) {
    console.error(`Thumbnail image not found at: ${imagePath}`);
    process.exit(1);
  }
  if (!outputBase) {
    console.error("O is required in fileOptions");
    process.exit(1);
  }

  // Final output path (always .mp4)
  const finalOutput = outputBase.endsWith(".mp4")
    ? outputBase
    : `${outputBase}.mp4`;

  // Prepare thumbnail video path
  const shortDir = path.dirname(finalOutput);
  const thumbnailVideoPath = path.join(
    shortDir,
    `${path.basename(outputBase)}_thumbnail_video.mp4`
  );

  // Interactive check if final exists
  if (fs.existsSync(finalOutput)) {
    const overwrite = await promptYesNo(
      `File '${finalOutput}' already exists. Overwrite?`
    );
    if (!overwrite) {
      console.log("Aborting: user chose not to overwrite existing output.");
      process.exit(0);
    }
  }

  // Build command to create thumbnail video from image
  // Based on the user's provided example but using variables and thumbnailSeconds
  const thumbArgs = [
    "-loop",
    "1",
    "-framerate",
    "60",
    "-t",
    String(thumbnailSeconds),
    "-i",
    imagePath,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-filter_complex",
    "[0]scale=2560:4550:force_original_aspect_ratio=increase,crop=2560:4550,eq=brightness=0.05,setsar=1,format=yuv420p[v]",
    "-map",
    "[v]",
    "-map",
    "1",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-shortest",
    thumbnailVideoPath,
  ];

  // Build command to concatenate thumbnail (first) + short video (second)
  // We'll ensure both inputs are resampled to 48000 and video scaled/padded to 1080x1920
  const concatFilter = `\
[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,eq=contrast=1:gamma=1.05:brightness=0.00:saturation=1.0[v0];\
[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];\
[0:a]aresample=48000[a0];\
[1:a]aresample=48000[a1];\
[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]`;

  const concatArgs = [
    "-i",
    thumbnailVideoPath,
    "-i",
    shortInput,
    "-filter_complex",
    concatFilter,
    "-map",
    "[outv]",
    "-map",
    "[outa]",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    finalOutput,
  ];

  try {
    // Ensure save dir exists
    if (saveConfigPath) {
      try {
        fs.mkdirSync(saveConfigPath, { recursive: true });
      } catch (e) {
        // ignore
      }
    }

    // Run thumbnail creation
    runCommand(ffmpegPath, thumbArgs);

    // Run concatenation
    runCommand(ffmpegPath, concatArgs);

    // Save config with history
    const executedAt = new Date().toISOString();
    const commitId = tryGetGitCommit();

    const configToSave = {
      ...(config || {}),
      history: {
        executed_at: executedAt,
        originalConfigFileName: path.basename(configAbs),
        ...(commitId && { commit_id: commitId }),
      },
    };

    if (saveConfigPath) {
      const inputFile = path.basename(shortInput);
      const inputBase = inputFile.replace(path.extname(inputFile), "");
      const configCopyName = `${inputBase}--CONFIG_saved.json`;
      const configCopyPath = path.join(saveConfigPath, configCopyName);
      fs.writeFileSync(
        configCopyPath,
        JSON.stringify(configToSave, null, 2),
        "utf-8"
      );
      console.log(`Config copied to: ${configCopyPath}`);
    } else {
      console.log("No pathToSaveConfig provided; skipping saving config copy.");
    }

    console.log(`\nSuccess. Final output: ${finalOutput}`);
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  }
}

// Run
main();
