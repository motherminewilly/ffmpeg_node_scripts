import fs from "fs";
import path from "path";
import { spawn, execSync } from "child_process";
import url from "url";

function isAbsolute(p) {
  return path.isAbsolute(p);
}

function toAbs(p, base) {
  if (!p) return p;
  return isAbsolute(p) ? p : path.resolve(base || process.cwd(), p);
}

function runCommand(cmd, args, env = process.env) {
  console.log("\nRunning command:");
  console.log(cmd + " " + args.map((a) => `"${a}"`).join(" "));

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["inherit", "inherit", "inherit"], // forward input/output/errors
      env,
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${cmd} exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
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

  // Load config
  let config;
  const ext = path.extname(configAbs).toLowerCase();
  try {
    if (ext === ".js" || ext === ".cjs" || ext === ".mjs") {
      const fileUrl = url.pathToFileURL(configAbs).href;
      const mod = await import(fileUrl);
      config = mod.default || mod;
    } else {
      const raw = fs.readFileSync(configAbs, "utf-8");
      config = JSON.parse(raw);
    }
  } catch (err) {
    console.error("Failed to load config:", err);
    process.exit(1);
  }

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
  const thumbnailMilliseconds = Math.max(0.01, thumbMs / 1000);

  if (!fs.existsSync(ffmpegPath)) {
    console.error(`FFmpeg binary not found at: ${ffmpegPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(shortInput)) {
    console.error(`Short input video not found at: ${shortInput}`);
    process.exit(1);
  }
  if (!fs.existsSync(imagePath)) {
    console.error(`Thumbnail image not found at: ${imagePath}`);
    process.exit(1);
  }
  if (!outputBase) {
    console.error(
      `Invalid or missing output path: fileOptions.pathFileOutputWithoutExtension resolved to '${outputBase}`
    );
    process.exit(1);
  }

  const finalOutput = outputBase.endsWith(".mp4")
    ? outputBase
    : `${outputBase}.mp4`;

  const shortDir = path.dirname(finalOutput);
  const thumbnailVideoPath = path.join(
    shortDir,
    `${path.basename(outputBase)}_thumbnail_video.mp4`
  );

  // No manual prompt — FFmpeg will handle overwrite prompt automatically
  const thumbArgs = [
    "-loop",
    "1",
    "-framerate",
    "60",
    "-t",
    String(thumbnailMilliseconds),
    "-i",
    imagePath,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-filter_complex",
    "[0]scale=2560:4550:force_original_aspect_ratio=increase," +
      "crop=2560:4550,eq=brightness=0.05,setsar=1,format=yuv420p[v]",
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

  const thumbnailPosition = shortOpts.thumbnailPosition || "end";

  // Decide input order depending on thumbnailPosition
  const inputs =
    thumbnailPosition === "start"
      ? [thumbnailVideoPath, shortInput] // thumbnail first
      : [shortInput, thumbnailVideoPath]; // short first

  // Filter template always expects [0]=first input, [1]=second input
  const concatFilter = `\
[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,\
pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];\
[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,\
pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];\
[0:a]aresample=48000[a0];\
[1:a]aresample=48000[a1];\
[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]`;

  // Build concat args dynamically
  const concatArgs = [
    "-i",
    inputs[0],
    "-i",
    inputs[1],
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
    if (saveConfigPath) {
      fs.mkdirSync(saveConfigPath, { recursive: true });
    }

    await runCommand(ffmpegPath, thumbArgs);
    await runCommand(ffmpegPath, concatArgs);

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
      fs.writeFileSync(configCopyPath, JSON.stringify(configToSave, null, 2));
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
