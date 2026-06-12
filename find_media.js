const fs = require('fs');
const path = require('path');

const dir = '/home/muis/.gemini/antigravity/brain/c1489dcb-8fc0-4c2c-bcbb-a371a7ddedd8/.tempmediaStorage';
fs.readdir(dir, (err, files) => {
  if (err) {
    console.error(err);
    return;
  }
  const fileInfos = files.map(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    return { name: file, mtime: stat.mtimeMs };
  });
  fileInfos.sort((a, b) => b.mtime - a.mtime);
  console.log(JSON.stringify(fileInfos.slice(0, 10), null, 2));
});
