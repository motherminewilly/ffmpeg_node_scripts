// config.js
export default {
  ffmpegOptions: {
    pathFFMPEG: "C:/ffmpeg/bin/ffmpeg.exe", // or full path like "/usr/local/bin/ffmpeg"
  },
  fileOptions: {
    pathShortInput: "short_video.webm",
    pathToThumbnailImage: "image.jpg",
    pathFileOutputWithoutExtension:
      "C:/users/aaron/develop/my-anon-repo/ffmpeg_scripts/final_output/my_final_video", // Note: "pathFileOutput" not "pathFileOutput"
    pathToSaveConfig: "./config_history/",
  },
  shortOptions: {
    thumbnailVideoMilliseconds: 1000, // Duration of thumbnail video
  },
};
