import { createDocumentImage } from "@/service/factories";
import OCR, { type ProcessedRotatedImagesResult } from "@/service/ocr";
import formidable from "formidable";
import fs from "fs";
import type { NextApiRequest, NextApiResponse } from "next";
import os from "os";
import path from "path";

import type { BlurryDetectorReport } from "../../utils/blur-detector";
import BlurryDetector from "../../utils/blur-detector";

type BlurryDetectorResults = Array<{
  status: "fulfilled" | "rejected";
  value?: BlurryDetectorReport;
  reason?: BlurryDetectorReport;
}>;

type Files = formidable.Files<string>;

export type ResponseData = {
  message: string;
  results?: BlurryDetectorResults;
};

export const config = {
  api: {
    bodyParser: false,
  },
};

const { processDocument } = OCR;

// The threshold is based on a few articles about this approach
// "The threshold can be set based on performance on the data we have."
// Further testing is needed to better attune it to doc upload
// https://www.linkedin.com/pulse/pinpointing-blurry-images-simple-nodejs-way-pablo-schaffner-bofill/
const slightBlurDetector = new BlurryDetector(300);

const ocrDetectionAction = async (
  files: Files
): Promise<ProcessedRotatedImagesResult[]> => {
  const results = await Promise.allSettled(
    Object.values(files).map(async (filelist = []) => {
      const [file] = filelist;
      if (file) {
        const saveTo = path.join(os.tmpdir(), file.originalFilename || "");
        fs.writeFileSync(saveTo, fs.readFileSync(file.filepath));
        const document = await createDocumentImage(saveTo);
        const processed = await processDocument(document);
        return processed;
      }
    })
  );

  return results;
};

const blurDectionAction = async (files: Files) => {
  const results: BlurryDetectorResults = await Promise.allSettled(
    Object.values(files).map(async (filelist = []) => {
      const [file] = filelist;
      if (file) {
        const saveTo = path.join(os.tmpdir(), file.originalFilename || "");
        fs.writeFileSync(saveTo, fs.readFileSync(file.filepath));
        const result = await slightBlurDetector.analyse(saveTo);

        console.log(
          `File [${saveTo}] is blurry? ${result.isBlurry ? "yes" : "no"} with ${
            result.score
          }`
        );

        if (result.isBlurry) {
          // rejects the promise
          throw result;
        }

        return result;
      }
    })
  );

  return results;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method === "POST") {
    const form = formidable({});
    const [, files] = await form.parse(req);
    // get the document processor we'd like to use from the query string
    const { engine } = req.query;
    // processing type can be ocr or blur
    if (engine === "ocr") {
      const results = await ocrDetectionAction(files);
      res.status(200).json({
        message: "Success!",
        results,
      });
    }

    if (engine === "blur") {
      const results = await blurDectionAction(files);
      res.status(200).json({
        message: "Success!",
        results,
      });
    }
  }
}
