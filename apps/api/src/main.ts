import { route } from './routes';
import { startServer } from './server';

startServer({ name: 'gm-api', route, defaultPort: 8787 });
