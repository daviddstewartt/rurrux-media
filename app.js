const path = require('path')
require('dotenv').config()

const express = require('express')
var bodyParser = require('body-parser');
const fs = require('fs');
// const cors = require('cors')
const app = express();
const AWS = require('aws-sdk')

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())

app.use(function(req, res, next) {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,POST,PATCH,DELETE');
	res.header('Access-Control-Allow-Headers', 'Authorization, Origin, X-Requested-With, Content-Type, Accept');
	next();
});
app.disable('x-powered-by');



// Store in enviromnet variables
const AWSData = {
    accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
    bucket: 'rurrux-production',
    key: (type) => `catalogue/raw/${type}/`
}

app.get('/test', (req, res)=>{
    console.log("This is test route");
})

// Begins the upload
/**
 * This route give the client a upload id to use for 
 * uploading parts to bucket
 */
app.post('/init-catalogue-upload', async (req, res) => {
    console.log("please work im begging you");
    const {filename, type} = req.body;
    console.log(`Creating UploadID for ${type} ${filename}`);
    
    const params = {
        Bucket: AWSData.bucket,
        Key: AWSData.key(type) + filename
    }

    s3 = new AWS.S3({accessKeyId: AWSData.accessKeyId, secretAccessKey: AWSData.secretAccessKey})
    console.log("Got S3 Client, Getting upload id");
    const response = await s3.createMultipartUpload(params).promise();
    console.log("upload request respinse from s3");
    console.log(response);

    return res.status(200).json({ success: true, uploadID: response.UploadId });
    // return {
    //     statusCode: 200,
    //     headers: {
    //         'Access-Control-Allow-Origin': '*',
    //         'Access-Control-Allow-Credentials': true
    //     },
    //     body: JSON.stringify({
    //         data: {
    //             uploadId: response.UploadId
    //         }
    //     })
    // }
})

app.post('/generate-presigned-url', async (req, res) => {
    
    const {PartNumber, uploadId, filename, type} = req.body;
    console.log(`Getting part ${PartNumber} pre-signed URL`);

    let params = {
        Bucket: AWSData.bucket,
        Key: AWSData.key(type) + filename,
        PartNumber,
        UploadId: uploadId 
    }

    const s3 = new AWS.S3({accessKeyId: AWSData.accessKeyId, secretAccessKey: AWSData.secretAccessKey, signatureVersion: 'v4'});

    const response = await s3.getSignedUrl('uploadPart', params);
    console.log("res");
    console.log(response);

    // return {
    //     statusCode: 200,
    //     headers: {
    //         'Access-Control-Allow-Origin': '*',
    //         'Access-Control-Allow-Credentials': true
    //     },
    //     body: JSON.stringify(response)
    // }
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(200).json({ success: true, presignedURL: response });
    
})


app.post('/complete-upload', async (req, res) => {
    console.log("Completing Upload...");
    const {parts, uploadId, filename, type} = req.body;
    console.log("parts");
    console.log(parts);
    const s3 = new AWS.S3(AWSData);

    const params = {
        Bucket: AWSData.bucket,
        Key: AWSData.key(type) + filename,
        MultipartUpload: {
            Parts: parts
        },
        UploadId: uploadId
    }

    console.log(AWSData.key(type) + filename);

    const data = await s3.completeMultipartUpload(params).promise();
    console.log("data");
    console.log(data);
    // return res.status(200).json({ success: true, data: JSON.stringify(data) });
    // console.log(data);
    return {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true
        },
        body: JSON.stringify(data)
    }
})

app.post('/abort-upload', async (req, res) => {
    console.log("Aborting Upload");
    const {fileName, uploadId, type} = req.body;
    try {
        const params = {
            Bucket: AWSData.bucket,
            Key: AWSData.key(type) + fileName,
            UploadId: uploadId
        };
    
        const abortUploadResponse = await s3.abortMultipartUpload(params).promise()
        return res.status(200).json({ success: true, upload: abortUploadResponse });
    }catch (e) {
        console.log(e);
        return res.status(500).json({ success: false, error: e });
    }
})

// Uploads the video to s3
app.post('/upload', (req, res) => {
    console.log("Uploading Video");
    console.log("res");
    console.log(res);
})


// Serves Video file from filesystem
app.get('/video', (req, res) => {
    console.log("Getting Video");
    // res.sendFile('assets/video1.mkv', {root: __dirname})


    // Streaming the data instead
    // var id = 'video1.mkv'
    var id = 'godfather.mp4'
    const videoPath = `assets/${id}`;
    const videoStat = fs.statSync(videoPath);
    const fileSize = videoStat.size;
    const videoRange = req.headers.range;
    if (videoRange) {
        const parts = videoRange.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1]
            ? parseInt(parts[1], 10)
            : fileSize-1;
        const chunksize = (end-start) + 1;
        const file = fs.createReadStream(videoPath, {start, end});
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
        };
        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res);
    }
})

// Servers Captions for video file
app.get('video/:id/caption', (req, res) => {
    console.log("Getting Media Captions");
    res.sendFile(`assets/captions/${req.params.id}.vtt`, {root: __dirname})
})

// Error Handling
app.use((err, req, res, next) => {
	res.status(err.status || 500);
	res.json({
		message: err.message,
		error: req.app.get('env') === 'development' ? err : { err: 'Error message' }
	});
});

// app.use(cors);

app.listen(5000, () => {
    console.log("Listening on Port 5000!");
})