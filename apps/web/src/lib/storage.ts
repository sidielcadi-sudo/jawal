import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const BUCKET = process.env.S3_BUCKET ?? 'jawal-dev';

export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  // Entre dans la signature SigV4 : doit valoir `s3_region` de Garage.
  region: process.env.S3_REGION ?? 'garage',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? '',
  },
  // Bucket dans le chemin, pas en sous-domaine (`jawal-dev.localhost` ne résout pas).
  forcePathStyle: true,
  // Checksums CRC32 envoyés par défaut depuis le SDK 3.729 : pas garantis sur
  // tous les services S3-compatibles, on ne les calcule que si l'API l'exige.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

let bucketReady = false;

/// S'assure que le bucket existe (idempotent, vérifié à la 1ère utilisation).
/// En dev, Garage le crée via `infra/garage/init.sh` ; la création ici ne sert
/// qu'aux fournisseurs où la clé a le droit de créer des buckets.
export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const exists = await s3
    .send(new HeadBucketCommand({ Bucket: BUCKET }))
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
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
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: args.buffer,
      ContentLength: args.buffer.length,
      ContentType: args.mime,
      Metadata: { filename: encodeURIComponent(args.filename) },
    }),
  );
  return {
    s3Key,
    sizeBytes: args.buffer.length,
    mime: args.mime,
    filename: args.filename,
  };
}

export async function presignedGet(s3Key: string, ttlSeconds = 15 * 60): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }), {
    expiresIn: ttlSeconds,
  });
}

/** Récupère le contenu binaire complet d'un objet (pour inlining base64). */
export async function getObjectBuffer(s3Key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
  if (!res.Body) throw new Error(`Objet vide : ${s3Key}`);
  return Buffer.from(await res.Body.transformToByteArray());
}

export async function deleteObject(s3Key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }));
  } catch {
    // best-effort : on n'empêche pas la suppression DB si le stockage échoue
  }
}
