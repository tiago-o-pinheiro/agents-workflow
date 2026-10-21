import { type RouteObject } from 'react-router'

import { HomePage } from './routes/home-page'
import { NotFoundPage } from './routes/not-found-page'
import { RouteError } from './routes/route-error'

export const routes: RouteObject[] = [
  { path: '/', element: <HomePage />, errorElement: <RouteError /> },
  { path: '*', element: <NotFoundPage /> },
]
