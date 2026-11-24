import fs from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

const FALLBACK_FIREBASE_CONFIG = {
  projectId: 'gen-lang-client-0735854742',
  firestoreDatabaseId: 'ai-studio-mkcbtsistemasesm-f0f8532f-8470-4ea9-bb16-214e09ebd157',
};

function loadFirebaseConfig(): { projectId: string; firestoreDatabaseId: string } {
  const baseDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  const candidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(baseDir, 'firebase-applet-config.json'),
    path.resolve(baseDir, '..', 'firebase-applet-config.json'),
    path.resolve(baseDir, '..', '..', 'firebase-applet-config.json'),
  ];
  for (const configPath of candidates) {
    try {
      if (fs.existsSync(configPath)) {
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (parsed?.projectId && parsed?.firestoreDatabaseId) {
          return {
            projectId: String(parsed.projectId),
            firestoreDatabaseId: String(parsed.firestoreDatabaseId),
          };
        }
      }
    } catch {
      // try next candidate
    }
  }
  return FALLBACK_FIREBASE_CONFIG;
}

const firebaseConfig = loadFirebaseConfig();

function parseServiceAccountFromEnv(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  const candidates = [raw];
  if (!raw.startsWith('{')) {
    try {
      candidates.push(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      // ignore invalid base64
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.private_key === 'string' &&
        typeof parsed.client_email === 'string'
      ) {
        const normalizedKey = parsed.private_key.replace(/\\n/g, '\n');
        if (normalizedKey.includes('BEGIN') && normalizedKey.includes('PRIVATE KEY')) {
          parsed.private_key = normalizedKey;
          return parsed as ServiceAccount;
        }
      }
    } catch {
      // try next candidate
    }
  }

  console.warn('FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed as valid service account JSON.');
  return null;
}

const serviceAccount = parseServiceAccountFromEnv();
let adminCredentialReady = false;

let app = getApps().length ? getApps()[0] : null;
if (!app) {
  if (serviceAccount) {
    try {
      const saProjectId =
        (serviceAccount as any).project_id ||
        serviceAccount.projectId ||
        firebaseConfig.projectId;
      app = initializeApp({
        credential: cert(serviceAccount),
        projectId: saProjectId,
      });
      adminCredentialReady = true;
    } catch (err) {
      console.error('Failed to initialize Firebase Admin with FIREBASE_SERVICE_ACCOUNT_JSON:', err);
      app = initializeApp({
        projectId: firebaseConfig.projectId,
      });
    }
  } else {
    app = initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }
} else {
  adminCredentialReady = Boolean(serviceAccount);
}

export const hasAdminServiceAccount = adminCredentialReady;
export const adminAuth = getAuth(app);
export const adminDb: Firestore | null = hasAdminServiceAccount
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : null;
