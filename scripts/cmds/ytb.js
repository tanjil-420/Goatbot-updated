const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const API_BASE_URL = "https://neokex-dl-apis.fly.dev/api";
const CACHE_DIR = path.join(__dirname, 'cache');

async function getStreamAndSize(url) {
  const response = await axios({
    method: "GET",
    url,
    responseType: "stream",
    timeout: 180000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Range': 'bytes=0-'
    }
  });
  const totalLength = response.headers["content-length"];
  return {
    stream: response.data,
    size: parseInt(totalLength) || 0
  };
}

function formatNumber(num) {
  if (!num) return "0";
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

const BULLET = "\u2022";

async function getStreamFromURL(url, index) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      await fs.mkdirp(CACHE_DIR);
    }
    
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    const filename = `thumb_${Date.now()}_${index}.jpg`;
    const filePath = path.join(CACHE_DIR, filename);
    
    await fs.writeFile(filePath, response.data);
    
    const stream = fs.createReadStream(filePath);
    stream.path = filePath;
    
    stream.on('end', () => {
      fs.unlink(filePath).catch(() => {});
    });
    
    return stream;
  } catch (e) {
    return null;
  }
}

module.exports = {
  config: {
    name: "ytb",
    aliases: ["youtube", "yt"],
    version: "2.1",
    author: "Neoaz ゐ",
    countDown: 5,
    role: 0,
    description: {
      vi: "Tai video, audio hoac xem thong tin video tren YouTube",
      en: "Download video, audio or view video information on YouTube"
    },
    category: "media",
    guide: {
      vi: "   {pn} [video|-v] [<ten video>|<link video>]: dung de tai video tu youtube."
        + "\n   {pn} [audio|-a] [<ten video>|<link video>]: dung de tai audio tu youtube"
        + "\n   {pn} [info|-i] [<ten video>|<link video>]: dung de xem thong tin video tu youtube"
        + "\n   Vi du:"
        + "\n    {pn} -v Fallen Kingdom"
        + "\n    {pn} -a Fallen Kingdom"
        + "\n    {pn} -i Fallen Kingdom",
      en: "   {pn} [video|-v] [<video name>|<video link>]: use to download video from youtube."
        + "\n   {pn} [audio|-a] [<video name>|<video link>]: use to download audio from youtube"
        + "\n   {pn} [info|-i] [<video name>|<video link>]: use to view video information from youtube"
        + "\n   Example:"
        + "\n    {pn} -v Fallen Kingdom"
        + "\n    {pn} -a Fallen Kingdom"
        + "\n    {pn} -i Fallen Kingdom"
    }
  },

  langs: {
    vi: {
      error: "Da xay ra loi: %1",
      noResult: "Khong co ket qua tim kiem nao phu hop voi tu khoa %1",
      choose: "%1Reply tin nhan voi so de chon hoac noi dung bat ki de go",
      video: "video",
      audio: "am thanh",
      downloading: "Dang tai xuong %1 \"%2\"",
      noVideo: "Rat tiec, khong tim thay video nao co dung luong nho hon 83MB",
      noAudio: "Rat tiec, khong tim thay audio nao co dung luong nho hon 26MB",
      noMedia: "Khong tim thay media nao de tai xuong",
      info: "Tieu de: %1\nKenh: %2\nThoi gian: %3\nLuot xem: %4\nNgay tai len: %5\nID: %6\nLink: %7"
    },
    en: {
      error: "An error occurred: %1",
      noResult: "No search results match the keyword %1",
      choose: "%1Reply to the message with a number to choose or any content to cancel",
      video: "video",
      audio: "audio",
      downloading: "Downloading %1 \"%2\"",
      noVideo: "Sorry, no video was found with a size less than 83MB",
      noAudio: "Sorry, no audio was found with a size less than 26MB",
      noMedia: "No media found to download",
      info: "Title: %1\nChannel: %2\nDuration: %3\nViews: %4\nUpload date: %5\nID: %6\nLink: %7"
    }
  },

  onStart: async function ({ args, message, event, commandName, getLang }) {
    let type;
    switch (args[0]) {
      case "-v":
      case "video":
        type = "video";
        break;
      case "-a":
      case "-s":
      case "audio":
      case "sing":
        type = "audio";
        break;
      case "-i":
      case "info":
        type = "info";
        break;
      default:
        return message.reply("Usage:\n-v [search/link] : Download video\n-a [search/link] : Download audio\n-i [search/link] : View info");
    }

    const checkurl = /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))((\w|-){11})(?:\S+)?$/;
    const urlYtb = checkurl.test(args[1]);

    if (urlYtb) {
      const videoUrl = args[1];
      message.reaction("⏳", event.messageID);
      await handleDownload({ type, videoUrl, message, event, getLang });
      return;
    }

    let keyWord = args.slice(1).join(" ");
    if (!keyWord) {
      return message.reply("Please provide a search keyword or YouTube link.");
    }
    
    keyWord = keyWord.includes("?feature=share") ? keyWord.replace("?feature=share", "") : keyWord;
    const maxResults = 6;

    let result;
    try {
      message.reaction("⏳", event.messageID);
      const searchResponse = await axios.get(`${API_BASE_URL}/youtube/search?query=${encodeURIComponent(keyWord)}`, { timeout: 30000 });
      
      if (!searchResponse.data.success || !searchResponse.data.data?.result?.all) {
        message.reaction("❌", event.messageID);
        return message.reply(getLang("noResult", keyWord));
      }
      
      result = searchResponse.data.data.result.all.slice(0, maxResults);
    } catch (err) {
      message.reaction("❌", event.messageID);
      return message.reply(getLang("error", err.message));
    }

    if (result.length === 0) {
      message.reaction("❌", event.messageID);
      return message.reply(getLang("noResult", keyWord));
    }

    let msg = "";
    const thumbnailPromises = [];

    for (let i = 0; i < result.length; i++) {
      const info = result[i];
      msg += `${i + 1}. ${info.title}\n`;
      msg += `${BULLET}   Duration: ${info.timestamp || formatDuration(info.seconds)}\n`;
      msg += `${BULLET}   Channel: ${info.author?.name || 'Unknown'}\n`;
      msg += `${BULLET}   Views: ${formatNumber(info.views)}\n\n`;
      
      if (info.thumbnail) {
        thumbnailPromises.push(getStreamFromURL(info.thumbnail, i));
      }
    }

    const attachments = (await Promise.all(thumbnailPromises)).filter(t => t !== null);

    message.reaction("✅", event.messageID);

    message.reply({
      body: getLang("choose", msg),
      attachment: attachments
    }, (err, info) => {
      if (!err) {
        global.GoatBot.onReply.set(info.messageID, {
          commandName,
          messageID: info.messageID,
          author: event.senderID,
          result,
          type
        });
      }
    });
  },

  onReply: async ({ event, api, Reply, message, getLang }) => {
    const { result, type } = Reply;
    const choice = parseInt(event.body);
    
    if (!isNaN(choice) && choice >= 1 && choice <= result.length) {
      const selectedVideo = result[choice - 1];
      const videoUrl = selectedVideo.url;
      
      api.unsendMessage(Reply.messageID);
      message.reaction("⏳", event.messageID);
      
      await handleDownload({ type, videoUrl, message, event, getLang, videoInfo: selectedVideo });
    } else {
      api.unsendMessage(Reply.messageID);
    }
  }
};

async function handleDownload({ type, videoUrl, message, event, getLang, videoInfo }) {
  let tempFilePath = null;
  
  try {
    const downloadResponse = await axios.get(`${API_BASE_URL}/download?url=${encodeURIComponent(videoUrl)}`, { timeout: 60000 });
    const data = downloadResponse.data;

    if (!data.success) {
      message.reaction("❌", event.messageID);
      return message.reply(getLang("error", data.error || "Failed to get download info"));
    }

    const title = data.title || videoInfo?.title || "YouTube Media";
    const author = data.author || videoInfo?.author?.name || "Unknown";
    const duration = data.duration || (videoInfo?.seconds ? formatDuration(videoInfo.seconds) : "");

    if (type === "info") {
      let infoMsg = getLang("info",
        title,
        author,
        duration,
        formatNumber(videoInfo?.views || 0),
        videoInfo?.ago || "Unknown",
        videoInfo?.videoId || "",
        videoUrl
      );

      const thumbnail = data.thumbnail || videoInfo?.thumbnail;
      if (thumbnail) {
        try {
          const thumbStream = await axios.get(thumbnail, { responseType: 'stream', timeout: 10000 });
          message.reaction("✅", event.messageID);
          return message.reply({
            body: infoMsg,
            attachment: thumbStream.data
          });
        } catch (e) {
          message.reaction("✅", event.messageID);
          return message.reply(infoMsg);
        }
      }
      message.reaction("✅", event.messageID);
      return message.reply(infoMsg);
    }

    let streamUrl;
    let fileExtension;
    let mediaType;

    if (type === "video") {
      streamUrl = data.videoStream || data.videoDownload;
      fileExtension = "mp4";
      mediaType = getLang("video");
      
      if (!streamUrl) {
        message.reaction("❌", event.messageID);
        return message.reply(getLang("noVideo"));
      }
    } else if (type === "audio") {
      streamUrl = data.audioStream || data.audioDownload;
      fileExtension = "mp3";
      mediaType = getLang("audio");
      
      if (!streamUrl) {
        streamUrl = data.videoStream || data.videoDownload;
        if (streamUrl) {
          fileExtension = "mp4";
          mediaType = getLang("video") + " (audio not available)";
        } else {
          message.reaction("❌", event.messageID);
          return message.reply(getLang("noAudio"));
        }
      }
    }

    if (!streamUrl) {
      message.reaction("❌", event.messageID);
      return message.reply(getLang("noMedia"));
    }

    const msgSend = await message.reply(getLang("downloading", mediaType, title));

    if (!fs.existsSync(CACHE_DIR)) {
      await fs.mkdirp(CACHE_DIR);
    }

    const safeTitle = title.substring(0, 30).replace(/[^a-z0-9]/gi, '_');
    const filename = `${Date.now()}_${safeTitle}.${fileExtension}`;
    tempFilePath = path.join(CACHE_DIR, filename);

    const { stream, size } = await getStreamAndSize(streamUrl);

    const MAX_VIDEO_SIZE = 83 * 1024 * 1024;
    const MAX_AUDIO_SIZE = 26 * 1024 * 1024;
    const maxSize = type === "video" ? MAX_VIDEO_SIZE : MAX_AUDIO_SIZE;

    if (size > 0 && size > maxSize) {
      message.reaction("❌", event.messageID);
      return message.reply(type === "video" ? getLang("noVideo") : getLang("noAudio"));
    }

    const writer = fs.createWriteStream(tempFilePath);
    stream.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    await message.reply({
      body: `${title}\n${BULLET}   Channel: ${author}${duration ? `\n${BULLET}   Duration: ${duration}` : ''}`,
      attachment: fs.createReadStream(tempFilePath)
    });

    message.reaction("✅", event.messageID);
    
    try {
      message.unsend(msgSend.messageID);
    } catch (e) {}

  } catch (error) {
    message.reaction("❌", event.messageID);
    console.error("YouTube Download Error:", error.message || error);
    return message.reply(getLang("error", error.message || "Download failed"));
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      await fs.unlink(tempFilePath).catch(console.error);
    }
  }
  }
      
