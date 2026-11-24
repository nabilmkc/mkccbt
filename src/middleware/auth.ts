import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifyCsrfToken, verifySessionToken } from '../lib/security.ts';
import { getOrCreateFirebaseUser, getUserById } from '../db/repository.ts';
import { hasPersistentDatabase, isServerlessEnv } from '../db/localStore.ts';

export type AppUserRole = 'super_admin' | 'guru' | 'siswa';

export interface AuthenticatedUser {
  id: number;
  uid: string;
  username: string;
  name: string;
  email: string | null;
  role: AppUserRole;
  className: string;
}

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
}

function normalizeDbRole(role: string | null | undefined): AppUserRole {
  if (role === 'super_admin') return 'super_admin';
  if (role === 'guru') return 'guru';
  return 'siswa';
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sesi tidak ditemukan. Silakan masuk kembali.' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Token otentikasi kosong.' });
  }

  try {
    if (token.startsWith('cbt.')) {
      const payload = verifySessionToken(token);
      if (!payload) {
        return res.status(401).json({ error: 'Sesi telah kedaluwarsa. Silakan masuk kembali.' });
      }
      const user = await getUserById(payload.userId);
      if (!user) {
        return res.status(401).json({ error: 'Akun pengguna tidak ditemukan.' });
      }
      req.authUser = {
        id: user.id,
        uid: user.uid,
        username: user.username,
        name: user.name,
        email: user.email,
        role: normalizeDbRole(user.role),
        className: user.className,
      };
      return next();
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const isBootstrappedAdmin =
      decodedToken.email_verified === true &&
      decodedToken.email === 'fikrulhusna26@admin.smk.belajar.id';
    const requestedRole: AppUserRole = isBootstrappedAdmin
      ? 'super_admin'
      : req.headers['x-intended-role'] === 'guru'
      ? 'guru'
      : 'siswa';
    const user = await getOrCreateFirebaseUser(
      decodedToken.uid,
      decodedToken.email || `${decodedToken.uid}@cbt.local`,
      decodedToken.name || decodedToken.email?.split('@')[0] || 'Pengguna Google',
      requestedRole
    );

    req.authUser = {
      id: user.id,
      uid: user.uid,
      username: user.username,
      name: user.name,
      email: user.email,
      role: normalizeDbRole(user.role),
      className: user.className,
    };
    return next();
  } catch (error) {
    console.error('Auth verification error:', error);
    return res.status(401).json({ error: 'Token tidak valid atau sesi telah berakhir.' });
  }
};

export const requireRole = (...allowedRoles: AppUserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Otentikasi diperlukan.' });
    }
    if (!allowedRoles.includes(req.authUser.role)) {
      return res.status(403).json({
        error: 'Akses ditolak. Peran akun Anda tidak diizinkan mengakses halaman ini.',
      });
    }
    return next();
  };
};

export const requireCsrf = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }
  if (!req.authUser) {
    return res.status(401).json({ error: 'Otentikasi diperlukan.' });
  }
  const csrfHeader = req.headers['x-csrf-token'];
  const token = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
  if (!verifyCsrfToken(token, req.authUser.uid)) {
    return res.status(403).json({
      error: 'Token keamanan CSRF tidak valid atau kedaluwarsa. Muat ulang sesi Anda.',
    });
  }
  const pathUrl = req.originalUrl || req.url || '';
  if (
    isServerlessEnv() &&
    !hasPersistentDatabase() &&
    (pathUrl.startsWith('/api/teacher/') || pathUrl.startsWith('/api/admin/'))
  ) {
    return res.status(503).json({
      error:
        'Database permanen belum terhubung di Vercel sehingga data tidak dapat disimpan permanen. Hubungkan PostgreSQL (Neon/Supabase) atau Upstash Redis di Vercel Storage (agar DATABASE_URL / POSTGRES_URL / KV_REST_API_URL aktif), atau atur FIREBASE_SERVICE_ACCOUNT_JSON di Environment Variables Vercel, lalu Redeploy.',
    });
  }
  return next();
};
