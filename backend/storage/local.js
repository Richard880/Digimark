const fs = require("fs");
const path = require("path");

// ✅ Single source of truth
const VIDEO_DIR = path.join(__dirname, "../storage/videos");

if (!fs.existsSync(VIDEO_DIR)) {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
}

function getVideoPath(storageKey) {
  return path.join(VIDEO_DIR, storageKey);
}

function saveVideo(inputPath, filename) {
  const outputPath = path.join(VIDEO_DIR, filename);
  fs.renameSync(inputPath, outputPath);

  return {
    storageKey: filename, // ✅ filename only
    path: outputPath,
  };
}

// ✅ Stream video safely (Range-supported)
function streamVideo(storageKey, range, res) {
  const filePath = getVideoPath(storageKey);
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    const chunkSize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": "video/mp4",
    });

    file.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

module.exports = {
  saveVideo,
  streamVideo,
  getVideoPath,
};

// const fs = require("fs");
// const path = require("path");

// const VIDEO_DIR = path.resolve(__dirname, "../storage/videos");

// if (!fs.existsSync(VIDEO_DIR)) {
//   fs.mkdirSync(VIDEO_DIR, { recursive: true });
// }

// function saveVideo(inputPath, filename) {
//   const outputPath = path.join(VIDEO_DIR, filename);
//   fs.renameSync(inputPath, outputPath);

//   return {
//     storageKey: filename, // ✅ ONLY filename
//     path: outputPath,
//   };
// }

// function getVideoPath(storageKey) {
//   return path.join(VIDEO_DIR, storageKey);
// }

// module.exports = {
//   saveVideo,
//   getVideoPath,
// };
