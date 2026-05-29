import { Client as MinioClient } from 'minio';

const ENDPOINT_RAW = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const ACCESS_KEY = process.env.S3_ACCESS_KEY ?? 'jawal';
const SECRET_KEY = process.env.S3_SECRET_KEY ?? 'jawal-secret';
export const BUCKET = process.env.S3_BUCKET ?? 'jawal-dev';

const url = new URL(ENDPOINT_RAW);

export const minio = new MinioClient({
  endPoint: url.hostname,
  port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
  useSSL: url.protocol === 'https:',
  accessKey: ACCESS_KEY,
  secretKey: SECRET_KEY,
});

let bucketReady = false;

/// S'assure que le bucket existe (idempotent, créé à la 1ère utilisation).
export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const exists = await minio.bucketExists(BUCKET).catch(() => false);
  if (!exists) {
    await minio.makeBucket(BUCKET, process.env.S3_REGION ?? 'us-east-1');
  }
  bucketReady = true;
}

export type PutResult = {
  s3Key: string;
  sizeBytes: number;
  mime: string;
  filename: string;
};

export async function putObject(args: {
  buffer: Buffer;
  filename: string;
  mime: string;
  tenantId: string;
  ownerType: string;
  ownerId: string;
}): Promise<PutResult> {
  await ensureBucket();
  const safeExt = (args.filename.match(/\.[a-zA-Z0-9]{1,8}$/)?.[0] ?? '').toLowerCase();
  const uuid = crypto.randomUUID();
  const s3Key = `tenant/${args.tenantId}/${args.ownerType}/${args.ownerId}/${uuid}${safeExt}`;
  await minio.putObject(BUCKET, s3Key, args.buffer, args.buffer.length, {
    'Content-Type': args.mime,
    'X-Amz-Meta-Filename': encodeURIComponent(args.filename),
  });
  return {
    s3Key,
    sizeBytes: args.buffer.length,
    mime: args.mime,
    filename: args.filename,
  };
}

export async function presignedGet(s3Key: string, ttlSeconds = 15 * 60): Promise<string> {
  return minio.presignedGetObject(BUCKET, s3Key, ttlSeconds);
}

export async function deleteObject(s3Key: string): Promise<void> {
  try {
    await minio.removeObject(BUCKET, s3Key);
  } catch {
    // best-effort : on n'empêche pas la suppression DB si MinIO échoue
  }
}
