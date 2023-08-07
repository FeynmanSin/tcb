const express = require('express');
const uploader = require('express-fileupload');
const path = require('path');
const cors = require('cors');
const app = express();
let tcb;
if (process.env.ENV === 'env') {
  tcb = require('../../db/tcb');
} else {
  const cloudBase = require('@cloudbase/node-sdk');
  tcb = cloudBase.init({
    env: 'sin-8ggq50jzd79a5e10',
  });

}
const cloudBase = tcb.database();

const {
  mkdir,
  readFile,
  writeFile,
  rmdir,
  unlink,
  readdir
} = require('fs').promises;
const {
  createReadStream,
  createWriteStream
} = require('fs');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(uploader());

app.all('*', (req, res, next) => {
  res.setHeader('Access-Control-Allow-origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET');
  next();
});

app.post('/checkCB', async (req, res) => {
  const resData = await tcb.uploadFile({
    cloudPath: `videos/46e12fabdc654a81c85bb963992bbd2a/46e12fabdc654a81c85bb963992bbd2a-0.mp4`,
    fileContent: createReadStream(`${__dirname}/upload_file/46e12fabdc654a81c85bb963992bbd2a/46e12fabdc654a81c85bb963992bbd2a-0.mp4`),
  })
  console.log(">>>>>>>>resData", resData);
  res.send({ code: 0, resData })
});
// 校验文件是否已上传接口
app.post('/checkFile', async (req, res) => {
  const { hash } = req.body;
  const filePath = path.join(`${__dirname}/upload_file/${hash}`);
  try {
    await readFile(filePath)// 通过hash查找是否有此文件
    res.status(200).send({ code: 1, msg: 'file is exist' });
  } catch (error) {
    mkdir(filePath, { recursive: false }, (err) => { });//如果没有则已hash为命名创建文件夹供后续上传分片存放
    res.status(200).send({ code: 1, msg: 'upload folder is created' });
  }
});

// 上传文件接口
app.post('/upload', async (req, res) => {
  const { name, hash } = req.body;
  const { chunk } = req.files;
  if (!chunk) {
    res.send({
      code: 1001,
      msg: 'No file uploaded',
    });
    return;
  }
  // const filePath = path.join(`__dirname/upload_file/${hash}`, name);
  try {
    // await writeFile(filePath, chunk.data);
    const resTCB = await tcb.uploadFile({
      cloudPath: `videos/${hash}/${name}`,
      fileContent: chunk.data,
    });
    console.log(">>>>>>>>resTCB", resTCB);
    res.send({
      code: 0,
      fileID: resTCB.fileID,
      msg: 'File is created'
    });
  } catch (error) {
    res.status(500).send({
      code: 2,
      msg: 'File can not created'
    });
  }
});


// 合并分片接口
app.post('/mergeFile', async (req, res) => {
  const { hash, ext, name, chunksTotal, fileSize } = req.body;
  const fileFolderPath = path.join(`${__dirname}/upload_file`);// 上存文件存放路径
  const chunksFolderPath = path.join(fileFolderPath, hash);//存放分片文件夹路径

  let files;// 用于存放所有分片名称组件

  // todo: 创建执行写入文件异步任务,待分片写入完成后再执行下一片
  const readStreamFun = (i, writeStream) => {
    return new Promise((resolve, reject) => {
      const chunkPath = path.join(chunksFolderPath, files[i]);//文件需要读取的分片路径
      const readStream = createReadStream(chunkPath);// 创建分片读取流
      readStream.pipe(writeStream, { end: false });// 将分片的读取流通果pipe管道写入到写入流文件中
      readStream.on('end', async () => {// 监听读取流end,在完成写入后进行后续操作
        try {
          readStream.unpipe(writeStream);// 关闭pipe管道
          await unlink(chunkPath);//删除已写入的分片
          resolve();
        } catch (error) {
          reject('写入失败');
        }
      });
    });
  }

  // todo: 合并分片文件方法
  const mergeChunk = async () => {
    const mergeFilePath = path.join(fileFolderPath, `${hash}${ext}`);// 合并后文件路径
    files = files.sort((a, b) => a.split('.')[0].split('-')[1] - b.split('.')[0].split('-')[1]);// 将获取的分片集合进行排序
    await writeFile(mergeFilePath, '');// 创建空文件用于将所有分片合并到此文件中
    const writeStream = createWriteStream(mergeFilePath);// 创建写入流
    for (let i = 0; i < files.length; i++) {
      await readStreamFun(i, writeStream);
    }

    // 判定合并后的文件size与客户端上传的文件size是否相等,相等则关闭写入流并删除临时文件夹
    if (writeStream.bytesWritten === fileSize) {
      try {
        await rmdir(chunksFolderPath);// 删除存放分片文件夹
        const resData = await cloudBase.collection('files').add({
          fileName: name.split('.')[0],
          hash,
          fileSize,
          type: ext.split('.')[1]
        });
        res.status(200).send({ code: 0, msg: '分片合并成功!', data: resData });
      } catch (error) {
        res.status(500).send({ code: 2, msg: '分片合并失败!' });
      }
    } else {
      unlink(mergeFilePath);// 删除合并文件
      mergeChunk();// 重新执行合并分片方法
    }
  }

  // todo: 创建循环定时器,当需要合并的分片,在服务端分片数量与客户端上传的分片数量相同时才进行合并
  let timer = setInterval(async () => {
    files = await readdir(chunksFolderPath);
    if (chunksTotal === files.length) {
      timer = clearImmediate(timer);// 取消循环定时器
      timer = null;// 清空定时器
      mergeChunk();// 执行合并分片任务
    }
  }, 1000);
});




module.exports = app;