import type { Instrumentation } from 'next';

export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.DEPLOYMENT_ENFORCE_CONFIG === 'true'
  ) {
    const { validateProductionConfiguration } =
      await import('@/src/modules/operations/production-config');
    const validated = validateProductionConfiguration('web');
    console.info(
      JSON.stringify({
        level: 'info',
        event: 'production_configuration_validated',
        profile: validated.profile,
        commit: process.env.APP_COMMIT_SHA ?? 'unknown',
      }),
    );
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'next_request_error',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      digest:
        typeof error === 'object' && error !== null && 'digest' in error
          ? String(error.digest)
          : undefined,
      method: request.method,
      route: context.routePath,
      routeType: context.routeType,
    }),
  );
};
