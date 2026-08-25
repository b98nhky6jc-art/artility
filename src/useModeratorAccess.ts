import { useEffect, useState } from "react";

type ModeratorAccess = {
  isModerator: boolean;
  role: "admin" | "moderator" | null;
};

let cachedUserId: string | null = null;
let cachedAccessRequest: Promise<ModeratorAccess> | null = null;

function loadModeratorAccess(userId: string) {
  if (cachedUserId === userId && cachedAccessRequest) {
    return cachedAccessRequest;
  }

  cachedUserId = userId;
  cachedAccessRequest = fetch("/api/admin/moderation/access", {
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) {
        return { isModerator: false, role: null } as ModeratorAccess;
      }

      const data = (await response.json()) as {
        is_moderator?: boolean;
        role?: "admin" | "moderator";
      };

      return {
        isModerator: Boolean(data.is_moderator),
        role: data.role ?? null,
      };
    })
    .catch(() => ({ isModerator: false, role: null }));

  return cachedAccessRequest;
}

export function useModeratorAccess(userId?: string) {
  const [access, setAccess] = useState<ModeratorAccess>({
    isModerator: false,
    role: null,
  });

  useEffect(() => {
    let isCurrent = true;

    if (!userId) {
      cachedUserId = null;
      cachedAccessRequest = null;
      return;
    }

    void loadModeratorAccess(userId).then((result) => {
      if (isCurrent) {
        setAccess(result);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [userId]);

  return userId
    ? access
    : { isModerator: false, role: null };
}
