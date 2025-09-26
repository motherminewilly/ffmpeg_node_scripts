/**
 * This is a NodeJS script that uses FFMPEG behind the scenes to remove audio that tends to cause
 * copyright issues in video platforms such as Youtube or other similar ones.
 * 
 * This script expects that the input video has 3 audio tracks/audio channels/audio sources.
 * - Video source (as expected)
 * - Audio track 1: In the videos that I want to modify with this script, this track contains
 *    gameplay audio from videogames I record plus my voice. This is the default track of the video.
 * - Audio track 2: This track is the one that holds the audio only for my voice without anything else.
 * - Audio track 3: This is the audio track that has only the audio of the videogame without my voice,
 *    and where the copyright claims happen.
 * 
 * Let's say you upload a video of a gamaplay with your voice, but you get a copyright claim because
 * some music at the backgroun at minute 00:15:13 - 00:17:01. Usually if you don't have this kind of
 * 3 audio tracks setup your screwed. You would not be able to easily remove the background audio
 * without removing your voice, so the audio of the video on that section would be effectively muted.
 * 
 * With the 3 audio tracks approach and this script you are able to provide from one to multiple
 * sections that you would like to mute on the "Audio track 3".
 * 
 * This script will grab the "Audio track 3" and will proceed to mute only the game audio sections
 * where the copyright happens. After it mutes that one part or even multiple ones (provided in the
 * ´audioSectionsToMute´ array) it will then combine the "Audio track 3 modified" in memory (not the 
 * original one) with the "Audio track 2" which contains the voice, let's call the result
 * "Audio track 3 modified (without copyright)" + "Audio track 2 (with voice)".
 * 
 * Finally it will save the "Audio track 3 modified (without copyright)" + "Audio track 2 (with voice)"
 * new audio track as the "Audio track 1" in the output video.
 * 
 * With this, basically you now will the same input video without the copyright audio sections on the
 * Audio Track 1, the Audio Track 2 with voice (and original without any modifications) and the
 * Audio Track 3 with the original audio with copyright from the audio game in this case.
 * 
 * AN IMPORTANT NOTE is that is script does not re-render the video itself, it only modifies the audio
 * tracks and copies the original video without any modification.
 * 
 * Previously I tried to do this kind of modification by hand on a video editor which re-rendered the
 * whole video and it took more than 3 hours to finish.
 * With this FFMPEG approach it took only 3 minutes to process the exact same video without re-rendering
 * which is far superior for my use case.
 */


/**
 * From the usage perspective this is the place where you need to specify what sections of the Audio Track
 * 3 you want to mute (to normally avoid copyright)
 */
const audioSectionsToMute = [
  {from: toSeconds('00:00:05'), to: toSeconds('00:00:10')},
];



const util = require('util');
const execP = util.promisify(require('child_process').exec);

const ffmpeg_exe_path = "C:/ProgramData/chocolatey/lib/ffmpeg/tools/ffmpeg/bin/ffmpeg.exe";
const video_input = "G:/experiments/cut_uploaded_2023-06-20 21-55-56.mkv";
const video_output = "G:/experiments/test.mkv";


function toSeconds(time) {
  const a = time.split(':'); // split it at the colons

  // minutes are worth 60 seconds. Hours are worth 60 minutes.
  const seconds = (+a[0]) * 60 * 60 + (+a[1]) * 60 + (+a[2]);
  return seconds;
}



function generateBetweens() {
  let finalStr = '';
  audioSectionsToMute.forEach((section, index) => {
    if(index === 0) {
      finalStr = `between(t,${section.from},${section.to})`
    } else {
      finalStr = `${finalStr}+between(t,${section.from},${section.to})`
    }
  });
  return finalStr;
}

async function mainRemoveSoundGame() {
  const command = `${ffmpeg_exe_path} -y -i "${video_input}" ` + 
    `-filter_complex "[0:a:2]volume=enable='${generateBetweens()}':volume=0[game];[0:a:1][game]amix=2:longest[aout]" ` +  
    `-map 0:V:0 -map "[aout]" -map 0:a:1 -map 0:a:2 ` +
    `-c:v copy ` + 
    `-disposition:a:0 default ` +
    `"${video_output}"`

    console.log('------------------');
    console.log('Command in execution: ', command);
    console.log('------------------');
    console.log('\nProcessing video... ');
  try {
    /**
     * Executing the command this way does not provide any real time feedback on what FFMPEG is doing, but it is good enough
     * for my usecase. If an error happens then it will print the error in the console which is enough for my usecase too.
     * 
     * In case you need to see the FFMPEG text output in realtime, using the child_process exec utility without promisify
     * would be the way to go.
     */
    // await execP(command);
    console.log('\nDone.');

  } catch (error) {
    console.log('error: ', error);
  }
}

async function mainRemoveSoundSecondVoice() {
  const command = `${ffmpeg_exe_path} -y -i "${video_input}" ` + 
    `-filter_complex "[0:a:3]volume=enable='${generateBetweens()}':volume=0[second_voice];[0:a:1][0:a:2][second_voice]amix=3:longest[aout]" ` +  
    `-map 0:V:0 -map "[aout]" -map 0:a:1 -map 0:a:2 -map 0:a:3 ` +
    `-c:v copy ` + 
    `-disposition:a:0 default ` +
    `"${video_output}"`

    console.log('------------------');
    console.log('Command in execution: ', command);
    console.log('------------------');
    console.log('\nProcessing video... ');
  try {
    /**
     * Executing the command this way does not provide any real time feedback on what FFMPEG is doing, but it is good enough
     * for my usecase. If an error happens then it will print the error in the console which is enough for my usecase too.
     * 
     * In case you need to see the FFMPEG text output in realtime, using the child_process exec utility without promisify
     * would be the way to go.
     */
    await execP(command);
    console.log('\nDone.');

  } catch (error) {
    console.log('error: ', error);
  }
}

async function mainRemoveSoundFirstVoice() {
  const command = `${ffmpeg_exe_path} -y -i "${video_input}" ` + 
    `-filter_complex "[0:a:1]volume=enable='${generateBetweens()}':volume=0[first_voice];[0:a:3][first_voice]amix=2:longest[aout]" ` +  
    `-map 0:V:0 -map "[aout]" -map 0:a:1 -map 0:a:2 -map 0:a:3 ` +
    `-c:v copy ` + 
    `-disposition:a:0 default ` +
    `"${video_output}"`

    console.log('------------------');
    console.log('Command in execution: ', command);
    console.log('------------------');
    console.log('\nProcessing video... ');
  try {
    /**
     * Executing the command this way does not provide any real time feedback on what FFMPEG is doing, but it is good enough
     * for my usecase. If an error happens then it will print the error in the console which is enough for my usecase too.
     * 
     * In case you need to see the FFMPEG text output in realtime, using the child_process exec utility without promisify
     * would be the way to go.
     */
    // await execP(command);
    console.log('\nDone.');

  } catch (error) {
    console.log('error: ', error);
  }
}

mainRemoveSoundFirstVoice();
// mainRemoveSoundGame();
// mainRemoveSoundSecondVoice();