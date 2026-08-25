import { useEffect, useState } from "react";

type AdminAccess = {
  isAdmin: boolean;
  role: "admin" | null;
};

let cachedUserId: string | null = null;
let cachedAccessRequest: Promise<AdminAccess> | null = null;

function loadAdminAccess(userId: string) {
  if (cachedUserId === userId && cachedAccessRequest) {
    return cachedAccessRequest;
  }

  cachedUserId = userId;
  cachedAccessRequest = fetch("/api/admin/moderation/access", {
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) {
        return { isAdmin: false, role: null } as AdminAccess;
      }

      const data = (await response.json()) as {
        is_admin?: boolean;
        role?: "admin";
      };

      return {
        isAdmin: Boolean(data.is_admin),
        role: data.role ?? null,
      };
    })
    .catch(() => ({ isAdmin: false, role: null }));

  return cachedAccessRequest;
}

export function useAdminAccess(userId?: string) {
  const [access, setAccess] = useState<AdminAccess>({
    isAdmin: false,
    role: null,
  });

  useEffect(() => {
    let isCurrent = true;

    if (!userId) {
      cachedUserId = null;
      cachedAccessRequest = null;
      return;
    }

    void loadAdminAccess(userId).then((result) => {
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
    : { isAdmin: false, role: null };
}
