# MKC CBT Security Specification

## 1. Data Invariants
1. **Default-Deny Catch-All**: Every path not explicitly matched is denied (`allow read, write: if false`).
2. **PII Isolation**: User email addresses are never stored on `/users/{userId}`; they are isolated in `/users/{userId}/private/{docId}` and readable only by the owner or a verified admin.
3. **No Self-Assigned Privilege Escalation**: Users creating their own `/users/{userId}` document may only assign `'siswa'` or `'guru'` roles, never `'super_admin'`, and cannot elevate `role` on update. Admin access is determined solely by `/admins/{uid}` existence or the verified bootstrapped admin email (`fikrulhusna26@admin.smk.belajar.id`).
4. **Master Gate & Relational Integrity**: An `ExamSession` cannot be created unless its referenced `examId` exists in `/exams/{examId}`. A `ViolationLog` under `/examSessions/{sessionId}/violations/{violationId}` requires the parent `/examSessions/{sessionId}` document to exist and belong to the authenticated student.
5. **Terminal State Locking**: Once an `ExamSession` reaches `'submitted'` or `'timed_out'`, students cannot modify answers, status, or scores. Only the owning teacher (grading essays) or an admin can update post-submission grading fields.
6. **Temporal Integrity & Immutability**: All `createdAt`, `updatedAt`, `startedAt`, `lastSavedAt`, and `occurredAt` timestamps must match `request.time`. Ownership fields (`uid`, `teacherUid`, `studentUid`, `examId`, `createdAt`) are immutable after creation.
7. **Strict Keys & Size Boundaries**: Every write validates exact key sets (`hasAll` + `hasOnly`), string `.size()` bounds, numeric ranges, and ID regex (`^[a-zA-Z0-9_\-]+$`).

## 2. The "Dirty Dozen" Payloads (Adversarial Rejection Cases)
1. **Shadow Field Injection on User Create**: `{ uid: "u1", username: "siswa01", name: "Test", role: "siswa", className: "XII", createdAt: NOW, isVerifiedAdmin: true }` -> Rejected (`hasOnly` blocks ghost field).
2. **Self-Assigned Super Admin Role**: `{ uid: "u1", username: "hacker", name: "Hacker", role: "super_admin", className: "XII", createdAt: NOW }` -> Rejected (role enum restricted on self-create).
3. **PII Leak Attempt (Cross-User Read)**: User B reads `/users/userA/private/info` -> Rejected (only owner or admin).
4. **Email Spoofing Without Verification**: Token with `email: "fikrulhusna26@admin.smk.belajar.id"` and `email_verified: false` attempts admin write -> Rejected (`email_verified == true` required).
5. **ID Poisoning (1.5KB Document ID)**: Write to `/questions/<1500-char-id>` -> Rejected (`isValidId` rejects >128 chars).
6. **Orphaned ExamSession**: Create `/examSessions/s1` referencing non-existent `examId: "nonexistent"` -> Rejected (`exists(/exams/nonexistent)` fails).
7. **Cross-Student Session Hijack**: Student B updates `/examSessions/s1` owned by Student A -> Rejected (`existing().studentUid == request.auth.uid`).
8. **Score Tampering by Student**: Student A updates `finalScore: 100` on their own `/examSessions/s1` -> Rejected (`affectedKeys().hasOnly(['lastSavedAt', 'status', 'violationCount'])`).
9. **Terminal State Bypass**: Student A attempts to change `status` from `'submitted'` back to `'in_progress'` -> Rejected (`existing().status in ['in_progress', 'suspended']`).
10. **Forged Timestamp**: Create `/questions/q1` with `createdAt` set to yesterday instead of `request.time` -> Rejected (`createdAt == request.time`).
11. **Value Poisoning on Points**: Update `/questions/q1` with `points: 999999` or `prompt: <10KB string>` -> Rejected (range & `.size()` bounds).
12. **Unscoped List Query**: Client queries `/examSessions` without `where('studentUid', '==', uid)` or `where('teacherUid', '==', uid)` -> Rejected (`allow list` evaluates `resource.data` against `request.auth.uid`).
