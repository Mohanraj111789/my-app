declare module '@/app/api/[[...route]]/route' {
  import { AppType } from 'hono';
  const routes: AppType;
  export type AppType = typeof routes;
  export { routes as default };
}
