import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { adminDb, hasAdminServiceAccount } from '../lib/firebase-admin.ts';

export interface StoredUser {
  id: number;
  uid: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  className: string;
  passwordHash: string | null;
  accessPin: string | null;
  createdAt: Date;
}

export interface StoredSchoolSettings {
  id: number;
  schoolName: string;
  examTheme: string;
  academicYear: string;
  footerText: string;
  updatedAt: Date;
}

export interface StoredQuestion {
  id: number;
  teacherId: number;
  subject: string;
  type: string;
  prompt: string;
  imageData: string | null;
  optionsJson: string | null;
  correctAnswer: string;
  points: number;
  difficulty: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredExam {
  id: number;
  teacherId: number;
  title: string;
  subject: string;
  examCode: string;
  description: string;
  durationMinutes: number;
  startTime: Date;
  endTime: Date;
  questionCount: number;
  kkm: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  allowStudentViewResult: boolean;
  isPublished: boolean;
  requireFullscreen: boolean;
  detectTabSwitch: boolean;
  detectWindowBlur: boolean;
  blockCopyPaste: boolean;
  maxViolations: number;
  violationAction: string;
  proctorPin: string;
  targetClassesJson: string;
  createdAt: Date;
}

export interface StoredExamQuestion {
  id: number;
  examId: number;
  questionId: number;
  orderIndex: number;
}

export interface StoredExamSession {
  id: number;
  examId: number;
  studentId: number;
  status: string;
  questionOrderJson: string;
  startedAt: Date;
  serverEndTime: Date;
  submittedAt: Date | null;
  lastSavedAt: Date;
  violationCount: number;
  autoScore: number;
  essayScore: number;
  maxPossibleScore: number;
  finalScore: number;
  essayGraded: boolean;
  teacherNotes: string;
}

export interface StoredStudentAnswer {
  id: number;
  sessionId: number;
  questionId: number;
  answerText: string;
  isFlagged: boolean;
  autoPoints: number;
  manualPoints: number;
  isCorrect: boolean | null;
  updatedAt: Date;
}

export interface StoredViolationLog {
  id: number;
  sessionId: number;
  examId: number;
  studentId: number;
  violationType: string;
  description: string;
  actionTaken: string;
  occurredAt: Date;
}

export interface StoreState {
  counters: {
    users: number;
    schoolSettings: number;
    questions: number;
    exams: number;
    examQuestions: number;
    examSessions: number;
    studentAnswers: number;
    violationLogs: number;
  };
  users: StoredUser[];
  schoolSettings: StoredSchoolSettings[];
  questions: StoredQuestion[];
  exams: StoredExam[];
  examQuestions: StoredExamQuestion[];
  examSessions: StoredExamSession[];
  studentAnswers: StoredStudentAnswer[];
  violationLogs: StoredViolationLog[];
}

type TableKey = keyof StoreState['counters'];

const COLLECTION_NAMES: Record<TableKey, string> = {
  users: 'cbt_users',
  schoolSettings: 'cbt_school_settings',
  questions: 'cbt_questions',
  exams: 'cbt_exams',
  examQuestions: 'cbt_exam_questions',
  examSessions: 'cbt_exam_sessions',
  studentAnswers: 'cbt_student_answers',
  violationLogs: 'cbt_violation_logs',
};

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const CUSTOM_DATA_DIR = process.env.CBT_DATA_DIR?.trim();
const DATA_DIR = CUSTOM_DATA_DIR
  ? path.resolve(CUSTOM_DATA_DIR)
  : IS_SERVERLESS
  ? path.join(os.tmpdir(), 'mkc-cbt-data')
  : path.resolve(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'cbt-store.json');

function stripQuotes(val: string | undefined): string {
  if (!val) return '';
  return val.trim().replace(/^['"]+|['"]+$/g, '').trim();
}

function resolvePostgresUrl(): string {
  const direct =
    stripQuotes(process.env.DATABASE_URL) ||
    stripQuotes(process.env.POSTGRES_URL) ||
    stripQuotes(process.env.POSTGRES_PRISMA_URL) ||
    stripQuotes(process.env.POSTGRES_URL_NON_POOLING) ||
    stripQuotes(process.env.DATABASE_URL_UNPOOLED);
  if (direct && (direct.startsWith('postgres://') || direct.startsWith('postgresql://'))) {
    return direct;
  }

  for (const [, val] of Object.entries(process.env)) {
    const trimmed = stripQuotes(val);
    if (
      trimmed &&
      (trimmed.startsWith('postgres://') ||
        trimmed.startsWith('postgresql://'))
    ) {
      return trimmed;
    }
  }

  const pgHost = stripQuotes(process.env.PGHOST || process.env.POSTGRES_HOST);
  const pgUser = stripQuotes(process.env.PGUSER || process.env.POSTGRES_USER);
  const pgPass = stripQuotes(process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD);
  const pgDb = stripQuotes(process.env.PGDATABASE || process.env.POSTGRES_DATABASE);
  if (pgHost && pgUser && pgPass && pgDb) {
    return `postgresql://${encodeURIComponent(pgUser)}:${encodeURIComponent(pgPass)}@${pgHost}/${encodeURIComponent(pgDb)}?sslmode=require`;
  }

  return '';
}

const POSTGRES_URL = resolvePostgresUrl();
const REDIS_REST_URL =
  stripQuotes(process.env.KV_REST_API_URL) ||
  stripQuotes(process.env.UPSTASH_REDIS_REST_URL);
const REDIS_REST_TOKEN =
  stripQuotes(process.env.KV_REST_API_TOKEN) ||
  stripQuotes(process.env.UPSTASH_REDIS_REST_TOKEN);
const HAS_REDIS_REST = Boolean(REDIS_REST_URL && REDIS_REST_TOKEN);

export function getStorageMode(): 'postgres' | 'redis' | 'firestore' | 'ephemeral' {
  if (POSTGRES_URL) return 'postgres';
  if (HAS_REDIS_REST) return 'redis';
  if (hasAdminServiceAccount && adminDb) return 'firestore';
  return 'ephemeral';
}

export function getStorageDiagnostics() {
  return {
    storageMode: getStorageMode(),
    vercelEnv: process.env.VERCEL_ENV || null,
    isServerless: IS_SERVERLESS,
    hasPostgresUrl: Boolean(POSTGRES_URL),
    hasRedisRest: HAS_REDIS_REST,
    hasFirebaseAdminKey: Boolean(hasAdminServiceAccount && adminDb),
  };
}

let pgPool: Pool | null = null;
let pgTableReady = false;

function getPgPool(): Pool | null {
  if (!POSTGRES_URL) return null;
  if (!pgPool) {
    const isLocal =
      POSTGRES_URL.includes('localhost') ||
      POSTGRES_URL.includes('127.0.0.1');
    pgPool = new Pool({
      connectionString: POSTGRES_URL,
      max: 3,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
    });
  }
  return pgPool;
}

async function ensurePgTable(pool: Pool): Promise<void> {
  if (pgTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cbt_app_state (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL DEFAULT 1,
      state_json TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  pgTableReady = true;
}

export function isServerlessEnv(): boolean {
  return IS_SERVERLESS;
}

export function hasPersistentDatabase(): boolean {
  return Boolean(POSTGRES_URL || HAS_REDIS_REST || (hasAdminServiceAccount && adminDb));
}

function emptyState(): StoreState {
  return {
    counters: {
      users: 0,
      schoolSettings: 0,
      questions: 0,
      exams: 0,
      examQuestions: 0,
      examSessions: 0,
      studentAnswers: 0,
      violationLogs: 0,
    },
    users: [],
    schoolSettings: [],
    questions: [],
    exams: [],
    examQuestions: [],
    examSessions: [],
    studentAnswers: [],
    violationLogs: [],
  };
}

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (value && typeof (value as any).toDate === 'function') {
    return (value as any).toDate();
  }
  return new Date(value);
}

function toNullableDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  return toDate(value);
}

function hydrateState(raw: any): StoreState {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;

  return {
    counters: { ...base.counters, ...(raw.counters || {}) },
    users: Array.isArray(raw.users)
      ? raw.users.map((u: any) => ({ ...u, createdAt: toDate(u.createdAt) }))
      : [],
    schoolSettings: Array.isArray(raw.schoolSettings)
      ? raw.schoolSettings.map((s: any) => ({ ...s, updatedAt: toDate(s.updatedAt) }))
      : [],
    questions: Array.isArray(raw.questions)
      ? raw.questions.map((q: any) => ({
          ...q,
          createdAt: toDate(q.createdAt),
          updatedAt: toDate(q.updatedAt),
        }))
      : [],
    exams: Array.isArray(raw.exams)
      ? raw.exams.map((e: any) => ({
          ...e,
          startTime: toDate(e.startTime),
          endTime: toDate(e.endTime),
          createdAt: toDate(e.createdAt),
        }))
      : [],
    examQuestions: Array.isArray(raw.examQuestions) ? raw.examQuestions : [],
    examSessions: Array.isArray(raw.examSessions)
      ? raw.examSessions.map((s: any) => ({
          ...s,
          startedAt: toDate(s.startedAt),
          serverEndTime: toDate(s.serverEndTime),
          submittedAt: toNullableDate(s.submittedAt),
          lastSavedAt: toDate(s.lastSavedAt),
        }))
      : [],
    studentAnswers: Array.isArray(raw.studentAnswers)
      ? raw.studentAnswers.map((a: any) => ({
          ...a,
          updatedAt: toDate(a.updatedAt),
        }))
      : [],
    violationLogs: Array.isArray(raw.violationLogs)
      ? raw.violationLogs.map((v: any) => ({
          ...v,
          occurredAt: toDate(v.occurredAt),
        }))
      : [],
  };
}

let cachedState: StoreState | null = null;
let localDiskLoaded = false;
let remoteVersion = -1;
let lastSyncedSnapshot = new Map<string, string>();
let initInFlight: Promise<void> | null = null;

function serializeRowForFirestore(row: any): Record<string, any> {
  return JSON.parse(JSON.stringify(row));
}

function buildSnapshotMap(state: StoreState): Map<string, string> {
  const map = new Map<string, string>();
  (Object.keys(COLLECTION_NAMES) as TableKey[]).forEach((table) => {
    const col = COLLECTION_NAMES[table];
    for (const row of state[table] as Array<{ id: number }>) {
      map.set(`${col}/${row.id}`, JSON.stringify(row));
    }
  });
  return map;
}

export async function initStore(): Promise<void> {
  const pool = getPgPool();
  if (pool) {
    if (initInFlight) {
      await initInFlight;
      return;
    }
    initInFlight = (async () => {
      try {
        await ensurePgTable(pool);
        const metaRes = await pool.query<{ version: number }>(
          'SELECT version FROM cbt_app_state WHERE id = $1',
          ['primary']
        );
        if (metaRes.rows.length > 0) {
          const incomingVersion = Number(metaRes.rows[0].version ?? 0);
          if (cachedState && remoteVersion === incomingVersion) {
            return;
          }
          const dataRes = await pool.query<{ version: number; state_json: string }>(
            'SELECT version, state_json FROM cbt_app_state WHERE id = $1',
            ['primary']
          );
          if (dataRes.rows.length > 0) {
            cachedState = hydrateState(JSON.parse(dataRes.rows[0].state_json));
            remoteVersion = Number(dataRes.rows[0].version ?? incomingVersion);
            return;
          }
        }
      } catch (err) {
        console.error('Failed to load store from PostgreSQL:', err);
      } finally {
        initInFlight = null;
      }
    })();
    await initInFlight;
  } else if (HAS_REDIS_REST) {
    if (initInFlight) {
      await initInFlight;
      return;
    }
    initInFlight = (async () => {
      try {
        const verRes = await fetch(`${REDIS_REST_URL}/get/mkc_cbt:version`, {
          headers: { Authorization: `Bearer ${REDIS_REST_TOKEN}` },
        });
        if (verRes.ok) {
          const verJson = (await verRes.json()) as { result?: string | null };
          const incomingVersion = Number(verJson?.result ?? 0);
          if (cachedState && incomingVersion > 0 && remoteVersion === incomingVersion) {
            return;
          }
          if (incomingVersion > 0) {
            const stateRes = await fetch(`${REDIS_REST_URL}/get/mkc_cbt:state`, {
              headers: { Authorization: `Bearer ${REDIS_REST_TOKEN}` },
            });
            if (stateRes.ok) {
              const stateJson = (await stateRes.json()) as { result?: string | null };
              if (stateJson?.result) {
                cachedState = hydrateState(JSON.parse(stateJson.result));
                remoteVersion = incomingVersion;
                return;
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to load store from Redis REST:', err);
      } finally {
        initInFlight = null;
      }
    })();
    await initInFlight;
  } else if (hasAdminServiceAccount && adminDb) {
    const db = adminDb;
    if (initInFlight) {
      await initInFlight;
      return;
    }
    initInFlight = (async () => {
      try {
        const metaSnap = await db.collection('cbt_store').doc('meta').get();
        if (metaSnap.exists) {
          const metaData = metaSnap.data() as {
            version?: number;
            counters?: Partial<StoreState['counters']>;
          };
          const incomingVersion = Number(metaData?.version ?? 0);
          if (cachedState && remoteVersion === incomingVersion) {
            return;
          }
          const tableKeys = Object.keys(COLLECTION_NAMES) as TableKey[];
          const snaps = await Promise.all(
            tableKeys.map((key) =>
              db.collection(COLLECTION_NAMES[key]).get()
            )
          );
          const raw: Record<string, any> = {
            counters: metaData?.counters || {},
          };
          tableKeys.forEach((key, idx) => {
            raw[key] = snaps[idx].docs.map((d) => d.data());
          });
          cachedState = hydrateState(raw);
          remoteVersion = incomingVersion;
          lastSyncedSnapshot = buildSnapshotMap(cachedState);
          return;
        }
      } catch (err) {
        console.error('Failed to load store from Firestore Admin:', err);
      } finally {
        initInFlight = null;
      }
    })();
    await initInFlight;
  }

  if (!cachedState) {
    getStore();
  }
}

export function getStore(): StoreState {
  if (cachedState) return cachedState;
  if (!localDiskLoaded) {
    localDiskLoaded = true;
    try {
      if (fs.existsSync(STORE_PATH)) {
        const content = fs.readFileSync(STORE_PATH, 'utf8');
        cachedState = hydrateState(JSON.parse(content));
        return cachedState;
      }
    } catch (err) {
      console.error('Failed to read local CBT store, initializing fresh state:', err);
    }
  }
  cachedState = emptyState();
  return cachedState;
}

export async function saveStore(): Promise<void> {
  const state = getStore();

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(state), 'utf8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch (err) {
    if (!IS_SERVERLESS) {
      console.error('Failed to persist local CBT store:', err);
    }
  }

  const pool = getPgPool();
  if (pool) {
    try {
      await ensurePgTable(pool);
      const nextVersion = Math.max(0, remoteVersion) + 1;
      await pool.query(
        `
          INSERT INTO cbt_app_state (id, version, state_json, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (id) DO UPDATE SET
            version = EXCLUDED.version,
            state_json = EXCLUDED.state_json,
            updated_at = NOW();
        `,
        ['primary', nextVersion, JSON.stringify(state)]
      );
      remoteVersion = nextVersion;
    } catch (err) {
      console.error('Failed to sync store to PostgreSQL:', err);
      if (IS_SERVERLESS) {
        throw new Error('Gagal menyimpan data ke database PostgreSQL.');
      }
    }
  } else if (HAS_REDIS_REST) {
    try {
      const nextVersion = Math.max(0, remoteVersion) + 1;
      const pipeRes = await fetch(`${REDIS_REST_URL}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['SET', 'mkc_cbt:state', JSON.stringify(state)],
          ['SET', 'mkc_cbt:version', String(nextVersion)],
        ]),
      });
      if (!pipeRes.ok) {
        throw new Error(`Redis REST status ${pipeRes.status}`);
      }
      remoteVersion = nextVersion;
    } catch (err) {
      console.error('Failed to sync store to Redis REST:', err);
      if (IS_SERVERLESS) {
        throw new Error('Gagal menyimpan data ke database Redis.');
      }
    }
  } else if (hasAdminServiceAccount && adminDb) {
    try {
      const nextSnapshot = buildSnapshotMap(state);
      const ops: Array<{
        type: 'set' | 'delete';
        col: string;
        docId: string;
        data?: Record<string, any>;
      }> = [];

      (Object.keys(COLLECTION_NAMES) as TableKey[]).forEach((table) => {
        const col = COLLECTION_NAMES[table];
        for (const row of state[table] as Array<{ id: number }>) {
          const key = `${col}/${row.id}`;
          const serialized = JSON.stringify(row);
          if (lastSyncedSnapshot.get(key) !== serialized) {
            ops.push({
              type: 'set',
              col,
              docId: String(row.id),
              data: serializeRowForFirestore(row),
            });
          }
        }
      });

      for (const oldKey of lastSyncedSnapshot.keys()) {
        if (!nextSnapshot.has(oldKey)) {
          const [col, docId] = oldKey.split('/');
          ops.push({ type: 'delete', col, docId });
        }
      }

      const nextVersion = Math.max(0, remoteVersion) + 1;
      const CHUNK_SIZE = 400;
      for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
        const batch = adminDb.batch();
        const chunk = ops.slice(i, i + CHUNK_SIZE);
        for (const op of chunk) {
          const ref = adminDb.collection(op.col).doc(op.docId);
          if (op.type === 'set' && op.data) {
            batch.set(ref, op.data);
          } else {
            batch.delete(ref);
          }
        }
        await batch.commit();
      }

      await adminDb.collection('cbt_store').doc('meta').set({
        version: nextVersion,
        counters: state.counters,
        updatedAt: new Date().toISOString(),
      });

      remoteVersion = nextVersion;
      lastSyncedSnapshot = nextSnapshot;
    } catch (err) {
      console.error('Failed to sync store to Firestore Admin:', err);
    }
  }
}

export function nextId(table: TableKey): number {
  const state = getStore();
  state.counters[table] += 1;
  return state.counters[table];
}
