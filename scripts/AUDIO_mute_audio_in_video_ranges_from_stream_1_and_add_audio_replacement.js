import fs from "fs";
import path from "path";
import { spawn, execSync } from "child_process";

function timeToSeconds(t) {
  const [h, m, s] = t.split(":");
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
}

function getAudioCodecByExtension(outputPath) {
  const ext = path.extname(outputPath).toLowerCase();
  switch (ext) {
    case ".mp4":
    case ".mov":
    case ".m4a":
    case ".mkv":
      return "aac";
    case ".webm":
      return "libopus";
    default:
      return "aac";
  }
}

function buildFFmpegCommand(config) {
  const inputFile = config.fileOptions.pathFileInput;
  const outputFile = config.fileOptions.pathFileOutput;
  const codec = getAudioCodecByExtension(outputFile);

  const externalAudios = [];
  config.timestamps.forEach((ts) => {
    if (ts.replaceAudioWith?.newAudioFile && !externalAudios.includes(ts.replaceAudioWith.newAudioFile)) {
      externalAudios.push(ts.replaceAudioWith.newAudioFile);
    }
  });

  const inputsCmd = [`-i`, inputFile];
  externalAudios.forEach((audioFile) => inputsCmd.push(`-i`, audioFile));

  const filterParts = [];
  const muteExpressions = [];

  const extAudioIndexMap = {};
  externalAudios.forEach((file, idx) => {
    extAudioIndexMap[file] = idx + 1;
  });

  // Mute filter for [0:a:0]
  config.timestamps.forEach((ts) => {
    const from = timeToSeconds(ts.from);
    const to = timeToSeconds(ts.to);
    muteExpressions.push(`between(t,${from},${to})`);
  });
  const muteExpr = muteExpressions.join("+");
  filterParts.push(`[0:a:0]volume=enable='${muteExpr}':volume=0[a0muted]`);

  const replacementMixes = [];

  config.timestamps.forEach((ts, tsIdx) => {
    if (!ts.replaceAudioWith) return;

    const extAudioFile = ts.replaceAudioWith.newAudioFile;
    const extAudioInputIdx = extAudioIndexMap[extAudioFile];
    const parentFrom = timeToSeconds(ts.from);
    const segLabels = [];

    ts.replaceAudioWith.timestamps.forEach((seg, segIdx) => {
      const segFrom = timeToSeconds(seg.from);
      const segTo = timeToSeconds(seg.to);
      const segDur = segTo - segFrom;
      const label = `[ra${tsIdx}s${segIdx}]`;
      const delay = parentFrom * 1000;

      const volumeFilter = seg.volume !== undefined ? `,volume=${seg.volume}` : "";
      const fadeIn = seg.fadeInDuration !== undefined ? seg.fadeInDuration : 0.5;
      const fadeOut = seg.fadeOutDuration !== undefined ? seg.fadeOutDuration : 0.5;
      const fadeOutStart = Math.max(segDur - fadeOut, 0);

      filterParts.push(
        `[${extAudioInputIdx}:a]atrim=start=${segFrom}:end=${segTo},` +
        `asetpts=PTS-STARTPTS${volumeFilter},` +
        `afade=t=in:st=0:d=${fadeIn},` +
        `afade=t=out:st=${fadeOutStart}:d=${fadeOut},` +
        `adelay=${delay}|${delay}${label}`
      );

      segLabels.push(label);
    });

    const mixLabel = `[ra${tsIdx}mix]`;
    if (segLabels.length === 1) {
      filterParts.push(`${segLabels[0]}anull${mixLabel}`);
    } else {
      filterParts.push(`${segLabels.join("")}amix=inputs=${segLabels.length}:dropout_transition=0${mixLabel}`);
    }

    replacementMixes.push(mixLabel);
  });

  const finalReplacementMixLabel =
    replacementMixes.length > 1
      ? "[repallmix]"
      : replacementMixes.length === 1
      ? replacementMixes[0]
      : "";

  if (replacementMixes.length > 1) {
    filterParts.push(
      `${replacementMixes.join("")}amix=inputs=${replacementMixes.length}:dropout_transition=0${finalReplacementMixLabel}`
    );
  }

  filterParts.push(
    finalReplacementMixLabel
      ? `[a0muted]${finalReplacementMixLabel}amix=inputs=2:dropout_transition=0[finalaudio]`
      : `[a0muted]anull[finalaudio]`
  );

  const filterComplex = filterParts.join("; ");
  const mapArgs = ["-map", "0:v", "-map", "[finalaudio]", "-map", "0:a:1?"];
  const codecArgs = ["-c:v", "copy", "-c:a", codec];

  const args = [...inputsCmd, "-filter_complex", filterComplex, ...mapArgs, ...codecArgs, outputFile];
  return { cmd: "ffmpeg", args };
}

function runFFmpeg(cmd, args) {
  const child = spawn(cmd, args, { stdio: "inherit" });

  child.on("close", (code) => {
    console.log(`FFmpeg exited with code ${code}`);
  });

  child.on("error", (err) => {
    console.error("Failed to start FFmpeg:", err);
  });
}

function addHistoryAndCopyConfig(configPath, config) {
  const originalConfigFilename = path.basename(configPath);
  const saveDir = config.fileOptions.pathToSaveConfig;
  if (!saveDir) return;

  try {
    fs.mkdirSync(saveDir, { recursive: true });
    const inputFile = path.basename(config.fileOptions.pathFileInput);
    const inputBase = inputFile.replace(path.extname(inputFile), "");
    const configCopyName = `${inputBase}--CONFIG.json`;
    const configCopyPath = path.join(saveDir, configCopyName);

    const executedAt = new Date().toISOString();
    let commitId = "";

    try {
      execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" });
      commitId = execSync("git rev-parse HEAD").toString().trim();
    } catch {}

    const configWithHistory = {
      ...config,
      history: {
        executed_at: executedAt,
        originalConfigFileName: originalConfigFilename,
        ...(commitId && { commit_id: commitId }),
      },
    };

    fs.writeFileSync(configCopyPath, JSON.stringify(configWithHistory, null, 2), "utf-8");
    console.log(`Config copied to: ${configCopyPath}`);
  } catch (err) {
    console.error("Failed to copy config:", err);
  }
}

function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error("Usage: node process-audio.js path/to/config.json");
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  try {
    const { cmd, args } = buildFFmpegCommand(config);
    console.log("\n\n");
    console.log("Running FFmpeg:");
    console.log(cmd + " " + args.map((a) => `"${a}"`).join(" "));
    console.log("\n\n");

    addHistoryAndCopyConfig(configPath, config);
    runFFmpeg(cmd, args);
  } catch (err) {
    console.error("Failed:", err);
  }
}

main();