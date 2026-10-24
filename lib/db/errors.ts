export function databaseRequestError(error: unknown, resource: string) {
  const details = error instanceof Error ? error.message : String(error ?? '');
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  const metadataCode = typeof error === 'object' && error !== null && 'meta' in error
    ? String((error as { meta?: { code?: unknown } }).meta?.code ?? '')
    : '';
  const combined = `${code} ${metadataCode} ${details}`;

  let message = `Failed to fetch ${resource}.`;
  let status = 500;
  if (/Environment variable not found: DATABASE_URL|DATABASE_URL.*(not set|missing)/i.test(details)) {
    message = 'Database is not configured. Set DATABASE_URL in the Vercel project and redeploy.';
    status = 503;
  } else if (/P1000|authentication failed against database server/i.test(combined)) {
    message = 'Supabase database authentication failed. Copy the current database connection URI from Supabase and update DATABASE_URL in Vercel.';
    status = 503;
  } else if (/P1003|database .* does not exist/i.test(combined)) {
    message = 'The database named in DATABASE_URL does not exist. Check the database name in the Supabase connection URI.';
    status = 503;
  } else if (/P1001|P1017|can't reach database server|could not connect to server|ECONNREFUSED|ETIMEDOUT|ENETUNREACH/i.test(combined)) {
    message = 'Cannot reach the Supabase database. In Vercel, set DATABASE_URL to the current Supabase Transaction Pooler URI (port 6543) for this project, then redeploy.';
    status = 503;
  } else if (/P2021|42P01|relation .* does not exist|table .* does not exist/i.test(combined)) {
    message = `The ${resource} database table is missing. Apply the non-destructive schema migration for this table in Supabase; do not reset the database.`;
    status = 503;
  } else if (/P2022|42703|column .* does not exist/i.test(combined)) {
    message = `The ${resource} table is missing a required column. Apply the matching non-destructive schema migration in Supabase.`;
    status = 503;
  } else if (/42501|row-level security|permission denied|insufficient privilege/i.test(combined)) {
    message = `The database role cannot read ${resource}. Check DATABASE_URL privileges and any enabled Row Level Security policies.`;
    status = 503;
  }

  if (process.env.NODE_ENV !== 'production') {
    const safeDetails = details.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[database URL redacted]');
    console.error(`[database:${resource}]`, { code: code || metadataCode || 'none', message: safeDetails });
  } else {
    // Keep enough detail to diagnose production failures while ensuring the
    // connection URI and any password fields never reach the deployment logs.
    const safeDetails = details
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[database URL redacted]')
      .replace(/(password\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]');
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : undefined;
    const safeCause = cause?.message
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[database URL redacted]')
      .replace(/(password\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]');
    console.error(`[database:${resource}]`, {
      name: error instanceof Error ? error.name : typeof error,
      code: code || metadataCode || 'none',
      message: safeDetails,
      cause: cause ? {
        name: cause.name,
        code: 'code' in cause ? String(cause.code ?? 'none') : 'none',
        message: safeCause,
      } : undefined,
    });
  }

  return {
    error: message,
    status,
  };
}
