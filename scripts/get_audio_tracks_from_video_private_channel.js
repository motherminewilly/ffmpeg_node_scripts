const util = require('util');
const execP = util.promisify(require('child_process').exec);
const path = require('path');

const ffmpeg_exe_path = "C:/ProgramData/chocolatey/lib/ffmpeg/tools/ffmpeg/bin/ffmpeg.exe";
const folderWithVideos = 'D:/obs/private/';
const folderToSaveAudios = 'E:/audio_gameplays/private_channel/';
const audioOutput = {
  voiceAndGame: '01_voice_and_game',
  voice: '02_voice',
  game: '03_game',
  other_voices: '04_other_voices',
}

function getAllFilesNameFromFolder(folderPath) {
  const readdirP = util.promisify(require('fs').readdir);
  return readdirP(folderPath);

}

async function main() {
    const videoNames = await getAllFilesNameFromFolder(folderWithVideos);
    const concurrentVideosToBeConverted = 5;
    while(videoNames.length !== 0) {
      try {
        const chunkVideosToConverted = videoNames.splice(0, concurrentVideosToBeConverted);
        console.log(`Beginning batch processing\n`);
        const promisesVideos = chunkVideosToConverted.map(videoName => {
        console.log(`Extracting audio tracks from: '${videoName}' video...`);
        const videoNameNoExtension = path.parse(videoName).name;
          
        /**
         * Executing the command this way does not provide any real time feedback on what FFMPEG is doing, but it is good enough
         * for my usecase. If an error happens then it will print the error in the console which is enough for my usecase too.
         * 
         * In case you need to see the FFMPEG text output in realtime, using the child_process exec utility without promisify
         * would be the way to go.
         */
        const command = `${ffmpeg_exe_path} -y -i "${folderWithVideos}${videoName}" ` + 
          `-vn -sn -map 0:a:0 -c:a mp3 -ab 192k "${folderToSaveAudios}${videoNameNoExtension}_${audioOutput.voiceAndGame}.mp3" ` +
          `-map 0:a:1 -c:a mp3 -ab 192k "${folderToSaveAudios}${videoNameNoExtension}_${audioOutput.voice}.mp3" ` +
          `-map 0:a:2 -c:a mp3 -ab 192k "${folderToSaveAudios}${videoNameNoExtension}_${audioOutput.game}.mp3" ` +
          `-map 0:a:3 -c:a mp3 -ab 192k "${folderToSaveAudios}${videoNameNoExtension}_${audioOutput.other_voices}.mp3"`

        console.log('command: ', command);

          return execP(command);
        });

        await Promise.all(promisesVideos);
        console.log(`Batch processed\n`);

      } catch (error) {
        console.log('error: ', error);
      }
    }
    console.log('------------------');
    console.log('\nDone');
}

main();
