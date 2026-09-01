const EMAIL_VERIFICATION_CUTOFF = Date.parse(
  "2026-08-24T22:10:00.000Z",
);

type VerificationUser = {
  emailVerified: boolean;
  createdAt: Date | string | number;
};

export function canUserContribute(
  user: VerificationUser | null | undefined,
) {
  if (!user) {
    return false;
  }

  if (user.emailVerified) {
    return true;
  }

  const createdAt = new Date(user.createdAt).getTime();

  return (
    Number.isFinite(createdAt) &&
    createdAt < EMAIL_VERIFICATION_CUTOFF
  );
}
