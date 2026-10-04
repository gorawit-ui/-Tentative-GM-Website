import { resolveNotificationMode } from './notification-mode';
import { createRoute } from './routes';
import { startServer } from './server';

const notificationMode = resolveNotificationMode(process.env.GM_NOTIFICATION_ADAPTER);
console.info(`gm-worker notification adapter: ${notificationMode}`);
startServer({ name: 'gm-worker', route: createRoute(notificationMode), defaultPort: 8788 });
